import { UserError } from "@/lib/admin-route";
import { writeAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";

/** Full identity numbers of an order; every reveal is audited with the field labels only, never the number. */
export async function revealIdentity(adminId: number, orderId: number): Promise<Array<{ label: string; type: string; number: string }>> {
  const rows = await sql<{ label: string; value: { type?: string } | null; value_encrypted: Buffer | null }[]>`
    select f.label, a.value, a.value_encrypted
      from order_answers a join form_fields f on f.id = a.form_field_id
     where a.order_id = ${orderId} and f.type = 'identity'
     order by f.position, f.id`;
  if (rows.length === 0) throw new UserError("Pesanan ini tidak punya nomor identitas.", 404);
  const kept = rows.filter((r) => r.value_encrypted);
  if (kept.length === 0) throw new UserError("Nomor identitas sudah dihapus sesuai masa simpan.", 410);
  await writeAudit(sql, { adminId, action: "reveal_identity", entity: "order", entityId: orderId, diff: { fields: kept.map((r) => r.label) } });
  return kept.map((r) => ({ label: r.label, type: r.value?.type ?? "", number: decrypt(Buffer.from(r.value_encrypted!)) }));
}
