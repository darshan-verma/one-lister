import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
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
