import { loadEnv } from "@one-lister/config/env";
import {
  AUTH_RATE_LIMIT,
  consumeRateLimit,
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

import { getAppDb } from "./db";
import { getEmailSender } from "./email";
import { getRedis } from "./redis";

function resolveAuthBaseUrl(): string {
  const env = loadEnv();
  return env.BETTER_AUTH_URL ?? env.APP_URL;
}

function clientIp(request: Request | undefined): string {
  if (!request) return "unknown";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

async function enforceAuthRateLimit(params: {
  action: "sign-in" | "sign-up" | "password-reset";
  email: string | undefined;
  request: Request | undefined;
}): Promise<void> {
  const email = (params.email ?? "unknown").trim().toLowerCase();
  const ip = clientIp(params.request);
  const env = loadEnv();
  const redis = getRedis(env.REDIS_URL);

  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
  }

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

const env = loadEnv();
const db = getAppDb();
const emailSender = getEmailSender();

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
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user: u, url }) => {
      void emailSender.send({
        to: u.email,
        subject: "Reset your One Lister password",
        text: `Reset your password:\n${url}\n\nIf you did not request this, ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user: u, url }) => {
      void emailSender.send({
        to: u.email,
        subject: "Verify your One Lister email",
        text: `Verify your email:\n${url}\n\nIf you did not create an account, ignore this email.`,
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
    storage: "memory",
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
        await enforceAuthRateLimit({
          action: "sign-in",
          email: typeof ctx.body?.email === "string" ? ctx.body.email : undefined,
          request: ctx.request,
        });
      }
      if (ctx.path === "/sign-up/email") {
        await enforceAuthRateLimit({
          action: "sign-up",
          email: typeof ctx.body?.email === "string" ? ctx.body.email : undefined,
          request: ctx.request,
        });
      }
      if (
        ctx.path === "/request-password-reset" ||
        ctx.path === "/forget-password"
      ) {
        await enforceAuthRateLimit({
          action: "password-reset",
          email: typeof ctx.body?.email === "string" ? ctx.body.email : undefined,
          request: ctx.request,
        });
      }
    }),
  },
  plugins: [nextCookies()],
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type AppSession = typeof auth.$Infer.Session;
