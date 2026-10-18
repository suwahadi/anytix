import { createSnapTransaction, midtransConfig } from "@/lib/payments/midtrans";
import { buildSnapPayload } from "@/lib/payments/snap-payload";
import { PAYMENT_METHODS } from "@/lib/validation/settings";

/** One Rp10.000 Snap transaction per method that expires unpaid after 5 minutes, so nothing is charged. */
async function main() {
  const { production } = midtransConfig();
  console.log(`Midtrans ${production ? "PRODUKSI" : "sandbox"}`);
  let failed = 0;
  for (const m of PAYMENT_METHODS) {
    const now = new Date();
    const payload = buildSnapPayload({
      midtransOrderId: `ANYTIX-CHECK-${m.key}-${now.getTime()}`,
      createdAt: now,
      payExpiresAt: new Date(now.getTime() + 5 * 60_000),
      paymentMethod: m.key,
      buyer: { name: "Cek Metode", email: "cek-metode@anytix.web.id", phone: "6281234567890" },
      items: [{ ticketCategoryId: 0, name: "Cek metode pembayaran", qty: 1, unitPrice: 10_000 }],
      discount: 0,
      fee: 0,
      total: 10_000,
    });
    try {
      await createSnapTransaction(payload);
      console.log(`OK     ${m.key.padEnd(8)} ${m.code}`);
    } catch (e) {
      failed++;
      console.log(`ERROR  ${m.key.padEnd(8)} ${m.code}  ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed > 0) {
    console.log(`\n${failed} metode gagal. Matikan metode itu di Panel → Pengaturan → Transaksi, atau aktifkan di dashboard Midtrans lalu cek ulang.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
