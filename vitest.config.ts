import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/core/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/core",
      include: [
        "src/core/**/*.ts",
        "src/content/**/*.ts",
        "src/session/**/*.ts",
        "src/ai/**/*.ts",
        "src/replay/**/*.ts",
        "src/testing/**/*.ts"
      ],
      thresholds: {
        lines: 90,
        statements: 87,
        functions: 95,
        branches: 77
      }
    }
  }
});
