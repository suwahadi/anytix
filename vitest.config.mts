import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
const shared = { environment: "node" as const, testTimeout: 60_000, hookTimeout: 60_000 };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { ...shared, name: "unit", include: ["tests/unit/**/*.test.ts"], setupFiles: ["./tests/setup.ts"] } },
      { resolve: { alias }, test: { ...shared, name: "db", include: ["tests/db/**/*.test.ts"], setupFiles: ["./tests/setup.ts", "./tests/db-guard.ts"] } },
    ],
  },
});
