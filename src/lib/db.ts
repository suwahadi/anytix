import postgres from "postgres";
import { getEnv } from "@/lib/env";

export type Sql = postgres.Sql<{ bigint: number }>;

const globalForSql = globalThis as unknown as { __anytixSql?: Sql };

/** Shared client on the Supabase transaction pooler, which does not support prepared statements. */
export function createSql(max = 10): Sql {
  return postgres(getEnv().DATABASE_URL, {
    prepare: false,
    max,
    idle_timeout: 20,
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
