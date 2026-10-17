import { findAdminByEmail, setTotpSecret } from "@/lib/admin-service";
import { sql } from "@/lib/db";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Pakai: npm run admin:reset-2fa -- email@domain.com");
  const admin = await findAdminByEmail(email);
  if (!admin) throw new Error(`Admin ${email} tidak ditemukan.`);
  await setTotpSecret(admin.id, null);
  console.log(`2FA untuk ${admin.email} dimatikan. Admin bisa masuk dengan email dan kata sandi saja.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
