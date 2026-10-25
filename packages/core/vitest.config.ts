import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

loadDotenv({ path: "../../.env" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    poolOptions: {
      threads: { singleThread: true },
    },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
