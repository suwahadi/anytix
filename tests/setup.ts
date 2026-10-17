import { existsSync } from "node:fs";
import { afterAll, vi } from "vitest";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

vi.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: (tag: string) => {
    const g = globalThis as { __revalidatedTags?: string[] };
    (g.__revalidatedTags ??= []).push(tag);
  },
}));

afterAll(async () => {
  const g = globalThis as { __anytixSql?: { end: (o: { timeout: number }) => Promise<void> } };
  if (g.__anytixSql) {
    await g.__anytixSql.end({ timeout: 5 });
    delete g.__anytixSql;
  }
});
