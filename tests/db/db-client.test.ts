import { describe, expect, it } from "vitest";
import { createSql, sql, transaction } from "@/lib/db";

describe("db client", () => {
  it("transaction commits on success and rolls back on error", async () => {
    await sql`delete from settings where key like 'test:tx%'`;
    await transaction(async (tx) => {
      await tx`insert into settings (key, value) values ('test:tx-commit', '1')`;
    });
    await expect(
      transaction(async (tx) => {
        await tx`insert into settings (key, value) values ('test:tx-rollback', '1')`;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await sql`select key from settings where key like 'test:tx%'`;
    expect(rows.map((r) => r.key)).toEqual(["test:tx-commit"]);
    await sql`delete from settings where key like 'test:tx%'`;
  });

  it("does not lose a query pipelined behind a slow one on the transaction pooler", async () => {
    const db = createSql(30);
    try {
      await Promise.all(Array.from({ length: 30 }, () => db`select pg_sleep(0.1)`));
      const burst = [
        db`select pg_sleep(0.3)`,
        ...Array.from({ length: 29 }, () => db`select pg_sleep(0.01)`),
        ...Array.from({ length: 30 }, (_, i) => db`select pg_sleep(0.2), ${i}::int as i`),
      ];
      const result = await Promise.race([Promise.all(burst), new Promise((r) => setTimeout(() => r("TIMEOUT"), 10_000))]);
      expect(result).not.toBe("TIMEOUT");
    } finally {
      await db.end({ timeout: 1 });
    }
  });
});
