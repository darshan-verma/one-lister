import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  /** Better Auth signing secret — min 32 chars. Generate with `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Base URL Better Auth uses for callbacks; defaults to APP_URL when unset. */
  BETTER_AUTH_URL: z.string().url().optional(),
  /**
   * Number of trusted reverse proxies that append to X-Forwarded-For.
   * 0 in local/dev (do not trust XFF); 1 behind AWS ALB.
   */
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(0),
  /** Product image / asset bucket. */
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  /** S3-compatible endpoint (MinIO). Only set in local/dev; omit in AWS. */
  S3_ENDPOINT: z.string().url().optional(),
  /** Explicit credentials for MinIO/dev. Omit in AWS to use the task role. */
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Public base URL for reading objects (CDN or MinIO path-style). */
  S3_PUBLIC_BASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Load and validate process.env. Safe to call multiple times — result is cached.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Reset cache — useful in tests. */
export function resetEnvCache(): void {
  cached = undefined;
}
