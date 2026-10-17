import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSql } from "@/lib/db";

const dir = join(process.cwd(), "db", "migrations");

async function main() {
  const sql = createSql(1);
  try {
    await sql`create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`;
    await sql`alter table public.schema_migrations enable row level security`;
    const applied = new Set(
      (await sql<{ filename: string }[]>`select filename from public.schema_migrations`).map((r) => r.filename),
    );
    const pending = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && !applied.has(f))
      .sort();
    if (pending.length === 0) {
      console.log("up to date");
      return;
    }
    for (const file of pending) {
      const text = readFileSync(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into public.schema_migrations (filename) values (${file})`;
      });
      console.log(`applied ${file}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
