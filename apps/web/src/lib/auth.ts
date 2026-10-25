import { loadEnv } from "@one-lister/config/env";
import {
  AUTH_RATE_LIMIT,
  consumeRateLimit,
  consumeSignInIpLimit,
  peekSignInEmailLimit,
  recordSignInEmailFailure,
} from "@one-lister/core";
import {
  account,
  session,
  user,
  verification,
} from "@one-lister/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { createRedisSecondaryStorage } from "./auth-secondary-storage";
import { getAppDb } from "./db";
import { getEmailSender } from "./email";
import { getRedis } from "./redis";
import { getClientIp } from "@/server/http";

function resolveAuthBaseUrl(): string {
  const env = loadEnv();
  return env.BETTER_AUTH_URL ?? env.APP_URL;
}

async function ensureRedisConnected() {
  const env = loadEnv();
  const redis = getRedis(env.REDIS_URL);
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
  }
  return redis;
}

function recipientDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "unknown";
}

function logEmailFailure(template: string, email: string, err: unknown): void {
  const domain = recipientDomain(email);
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[email] send failed template=${template} domain=${domain}: ${detail}`);
}

function isAuthFailure(returned: unknown): boolean {
  if (returned instanceof APIError) return true;
  if (
    returned &&
    typeof returned === "object" &&
    "statusCode" in returned &&
    typeof (returned as { statusCode: unknown }).statusCode === "number" &&
    (returned as { statusCode: number }).statusCode >= 400
  ) {
    return true;
  }
  if (
    returned &&
    typeof returned === "object" &&
    "status" in returned &&
    typeof (returned as { status: unknown }).status === "string"
  ) {
    const status = (returned as { status: string }).status.toUpperCase();
    return (
      status === "UNAUTHORIZED" ||
      status === "FORBIDDEN" ||
      status === "BAD_REQUEST" ||
      status === "TOO_MANY_REQUESTS"
    );
  }
  return false;
}

async function enforceSignUpOrResetLimit(params: {
  action: "sign-up" | "password-reset";
  email: string | undefined;
  request: Request | undefined;
}): Promise<void> {
  const env = loadEnv();
  const email = (params.email ?? "unknown").trim().toLowerCase();
  const ip = getClientIp(
    params.request?.headers ?? new Headers(),
    env.TRUSTED_PROXY_COUNT,
  );
  const redis = await ensureRedisConnected();

  const checks = await Promise.all([
    consumeRateLimit(redis, {
      keyParts: [params.action, "email", email],
      max: AUTH_RATE_LIMIT.max,
      windowSeconds: AUTH_RATE_LIMIT.windowSeconds,
    }),
    consumeRateLimit(redis, {
      keyParts: [params.action, "ip", ip],
      max: AUTH_RATE_LIMIT.max,
      windowSeconds: AUTH_RATE_LIMIT.windowSeconds,
    }),
  ]);

  const blocked = checks.find((c) => !c.allowed);
  if (blocked && !blocked.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Please try again later.",
    });
  }
}

async function enforceSignInBefore(params: {
  email: string | undefined;
  request: Request | undefined;
}): Promise<void> {
  const env = loadEnv();
  const email = (params.email ?? "unknown").trim().toLowerCase();
  const ip = getClientIp(
    params.request?.headers ?? new Headers(),
    env.TRUSTED_PROXY_COUNT,
  );
  const redis = await ensureRedisConnected();

  const [emailPeek, ipResult] = await Promise.all([
    peekSignInEmailLimit(redis, email),
    consumeSignInIpLimit(redis, ip),
  ]);

  if (!emailPeek.allowed || !ipResult.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Please try again later.",
    });
  }
}

async function recordSignInFailureIfNeeded(params: {
  email: string | undefined;
  returned: unknown;
  newSession: unknown;
}): Promise<void> {
  // Successful sign-in creates a session — do not consume the email budget.
  if (params.newSession) return;
  if (!isAuthFailure(params.returned)) return;

  const email = (params.email ?? "unknown").trim().toLowerCase();
  const redis = await ensureRedisConnected();
  const result = await recordSignInEmailFailure(redis, email);
  if (!result.allowed) {
    // Counter already past max; next before-hook will block.
  }
}

const env = loadEnv();
const db = getAppDb();
const emailSender = getEmailSender();
const redisForAuth = getRedis(env.REDIS_URL);

export const auth = betterAuth({
  baseURL: resolveAuthBaseUrl(),
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  secondaryStorage: createRedisSecondaryStorage(redisForAuth),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user: u, url }) => {
      void emailSender
        .send({
          to: u.email,
          subject: "Reset your One Lister password",
          text: `Reset your password:\n${url}\n\nIf you did not request this, ignore this email.`,
        })
        .catch((err: unknown) => {
          logEmailFailure("password-reset", u.email, err);
        });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user: u, url }) => {
      void emailSender
        .send({
          to: u.email,
          subject: "Verify your One Lister email",
          text: `Verify your email:\n${url}\n\nIf you did not create an account, ignore this email.`,
        })
        .catch((err: unknown) => {
          logEmailFailure("email-verification", u.email, err);
        });
    },
  },
  user: {
    additionalFields: {
      platformRole: {
        type: ["ops_agent", "admin"],
        required: false,
        defaultValue: null,
        input: false,
        returned: true,
      },
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
  },
  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": false,
      "/sign-up/email": false,
      "/request-password-reset": false,
      "/forget-password": false,
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        await enforceSignInBefore({
          email: typeof ctx.body?.email === "string" ? ctx.body.email : undefined,
          request: ctx.request,
        });
      }
      if (ctx.path === "/sign-up/email") {
        await enforceSignUpOrResetLimit({
          action: "sign-up",
          email: typeof ctx.body?.email === "string" ? ctx.body.email : undefined,
          request: ctx.request,
        });
      }
      if (
        ctx.path === "/request-password-reset" ||
        ctx.path === "/forget-password"
      ) {
        await enforceSignUpOrResetLimit({
          action: "password-reset",
          email: typeof ctx.body?.email === "string" ? ctx.body.email : undefined,
          request: ctx.request,
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        await recordSignInFailureIfNeeded({
          email: typeof ctx.body?.email === "string" ? ctx.body.email : undefined,
          returned: ctx.context.returned,
          newSession: ctx.context.newSession,
        });
      }
    }),
  },
  plugins: [nextCookies()],
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type AppSession = typeof auth.$Infer.Session;
