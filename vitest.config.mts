import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside Next's react-server build; tests run server modules directly.
    alias: { "server-only": new URL("./tests/setup/empty-module.ts", import.meta.url).pathname },
  },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          setupFiles: ["tests/setup/test-env.ts"],
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/{integration,security}/**/*.test.ts"],
          setupFiles: ["tests/setup/test-env.ts"],
          // Starts a standalone in-memory MongoDB (same topology as local dev, D-004).
          globalSetup: ["tests/setup/mongo-memory.ts"],
          // Files share one Redis DB and one Mongo server; run them one at a time.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/components/setup.ts"],
        },
      },
    ],
  },
});
