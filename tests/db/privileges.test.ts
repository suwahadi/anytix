import { describe, expect, it } from "vitest";
import { sql } from "@/lib/db";

describe("database privileges", () => {
  it("no public function is executable by anon or authenticated", async () => {
    const rows = await sql<{ fn: string }[]>`
      select p.oid::regprocedure::text as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute'))`;
    expect(rows.map((r) => r.fn)).toEqual([]);
  });
});
