import { existsSync } from "node:fs";
import { afterAll } from "vitest";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

afterAll(async () => {
  const g = globalThis as { __anytixSql?: { end: (o: { timeout: number }) => Promise<void> } };
  if (g.__anytixSql) {
    await g.__anytixSql.end({ timeout: 5 });
    delete g.__anytixSql;
  }
});
