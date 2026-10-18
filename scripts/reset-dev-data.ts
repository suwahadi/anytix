import { sql, transaction } from "@/lib/db";
import { assertDbWriteAllowed } from "@/lib/db-guard";

const TABLES = [
  "checkin_events",
  "tickets",
  "order_answers",
  "consents",
  "email_logs",
  "payment_events",
  "payments",
  "jobs",
  "orders",
  "hold_items",
  "holds",
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const counts = await Promise.all(TABLES.map(async (t) => [t, (await sql<{ n: number }[]>`select count(*)::int as n from ${sql(t)}`)[0].n] as const));
  for (const [t, n] of counts) console.log(`${t.padEnd(16)} ${n}`);
  if (!apply) {
    console.log("Dry run: tidak ada yang dihapus. Jalankan dengan -- --apply dan DB_WRITE_ALLOWED=true untuk menghapus.");
    return;
  }
  assertDbWriteAllowed(process.env, "reset-dev-data");
  await transaction(async (tx) => {
    for (const t of TABLES) await tx`delete from ${tx(t)}`;
    await tx`update vouchers set used = 0, held = 0`;
  });
  const drift = await sql`select * from reconcile_inventory(true)`;
  console.log(`Data transaksi dihapus. Kuota diperbaiki di ${drift.length} baris inventory. Event, kategori, form, voucher, pengaturan dan admin tetap.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
