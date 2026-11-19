import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/jobs/**/*.ts", "src/api/routes/**/*.ts", "src/api/rateLimiter.ts", "src/api/circuitBreaker.ts"],
      thresholds: {
        statements: 15,
        branches: 10,
        functions: 20,
        lines: 15,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: "forks",
  },
});
