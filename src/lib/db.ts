import postgres from "postgres";
import { getEnv } from "@/lib/env";

export type Sql = postgres.Sql<{ bigint: number }>;

const globalForSql = globalThis as unknown as { __anytixSql?: Sql };

// Supavisor in transaction mode drops a query pipelined behind another on the same connection.
// max_pipeline is a real postgres.js option missing from its type definitions.
const noPipelining = { max_pipeline: 0 };

/** Shared client on the Supabase transaction pooler, which does not support prepared statements. */
export function createSql(max = 10): Sql {
  return postgres(getEnv().DATABASE_URL, {
    prepare: false,
    max,
    idle_timeout: 20,
    ...noPipelining,
    onnotice: () => {},
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: number) => x.toString(),
        parse: (x: string) => Number(x),
      },
    },
  });
}

export const sql: Sql = (globalForSql.__anytixSql ??= createSql());

export type Tx = postgres.ReservedSql<{ bigint: number }>;

/** Use instead of `sql.begin`, which postgres.js cannot run with `max_pipeline: 0`. */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>, db: Sql = sql): Promise<T> {
  const tx = await db.reserve();
  try {
    await tx`begin`;
    const result = await fn(tx);
    await tx`commit`;
    return result;
  } catch (e) {
    await tx`rollback`.catch(() => {});
    throw e;
  } finally {
    tx.release();
  }
}
