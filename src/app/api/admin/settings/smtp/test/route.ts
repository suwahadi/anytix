import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { getEmailProvider } from "@/lib/email/email-provider";
import { getSettingsGroup } from "@/lib/settings-service";
import { smtpTestInput } from "@/lib/validation/settings";

export const POST = adminRoute(smtpTestInput, async ({ body }) => {
  const provider = await getEmailProvider();
  const site = await getSettingsGroup("site");
  const sentAt = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  try {
    const { messageId } = await provider.send({
      to: body.to,
      subject: `Uji SMTP ${site.name}`,
      text: `Email uji dari panel ${site.name}, dikirim ${sentAt} WIB. Kalau email ini sampai, pengaturan SMTP sudah benar.`,
      html: `<p>Email uji dari panel <strong>${site.name}</strong>, dikirim ${sentAt} WIB.</p><p>Kalau email ini sampai, pengaturan SMTP sudah benar.</p>`,
    });
    return NextResponse.json({ messageId });
  } catch (e) {
    const detail = (e as { response?: string; message?: string }).response ?? (e as Error).message;
    return NextResponse.json({ error: `Gagal mengirim: ${detail}` }, { status: 502 });
  }
});
