import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserError } from "@/lib/admin-route";
import { createAdmin } from "@/lib/admin-service";
import { createFaq, listFaqs, removeFaq, reorderFaqs, updateFaq } from "@/lib/content/faq-service";
import { sql } from "@/lib/db";
import { getPublicFaqs } from "@/lib/public/catalog-queries";
import { getSettingsGroup, putSettingsGroup, type PagesView } from "@/lib/settings-service";

let adminId = 0;
let originalOrder: number[] = [];
let originalPages: PagesView;
const created: number[] = [];

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
  originalOrder = (await listFaqs()).map((f) => f.id);
  originalPages = await getSettingsGroup("pages");
});

afterAll(async () => {
  for (const id of created) await sql`delete from faqs where id = ${id}`;
  const ids = (await listFaqs()).map((f) => f.id);
  if (ids.length > 0) await reorderFaqs(adminId, [...originalOrder.filter((id) => ids.includes(id)), ...ids.filter((id) => !originalOrder.includes(id))]);
  await putSettingsGroup(adminId, "pages", originalPages);
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where id = ${adminId}`;
});

describe("faq service", () => {
  it("creates at the end, sanitizes the answer and writes an audit row", async () => {
    const faq = await createFaq(adminId, { question: "Pertanyaan uji coba?", answer: `<p onclick="x()">Jawab<script>a()</script></p>`, isActive: true });
    created.push(faq.id);
    expect(faq.answer).toBe("<p>Jawab</p>");
    expect(faq.position).toBe(Math.max(0, ...(await listFaqs()).filter((f) => f.id !== faq.id).map((f) => f.position)) + 1);
    const [audit] = await sql<{ action: string }[]>`select action from audit_logs where admin_id = ${adminId} and entity = 'faq' and entity_id = ${String(faq.id)}`;
    expect(audit.action).toBe("create");
  });

  it("hidden items never reach the public list", async () => {
    const faq = await createFaq(adminId, { question: "Pertanyaan tersembunyi?", answer: "<p>x</p>", isActive: true });
    created.push(faq.id);
    expect((await getPublicFaqs()).map((f) => f.id)).toContain(faq.id);
    await updateFaq(adminId, faq.id, { question: faq.question, answer: faq.answer, isActive: false });
    expect((await getPublicFaqs()).map((f) => f.id)).not.toContain(faq.id);
  });

  it("reorder must list every item exactly once", async () => {
    const ids = (await listFaqs()).map((f) => f.id);
    await expect(reorderFaqs(adminId, ids.slice(1))).rejects.toBeInstanceOf(UserError);
    await reorderFaqs(adminId, [...ids].reverse());
    expect((await listFaqs()).map((f) => f.id)).toEqual([...ids].reverse());
  });

  it("removing an unknown item is a 404", async () => {
    const faq = await createFaq(adminId, { question: "Akan dihapus segera?", answer: "", isActive: true });
    await removeFaq(adminId, faq.id);
    await expect(removeFaq(adminId, faq.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("content pages", () => {
  it("about and contact are sanitized and keep only our own images", async () => {
    const own = `${process.env.NEXT_PUBLIC_MEDIA_BASE_URL}/page/2026/abcdefghijkl-lg.webp`;
    await putSettingsGroup(adminId, "pages", {
      about: `<h2>Tentang</h2><img src="${own}" alt="Tim"><img src="https://evil.example/x.webp">`,
      contact: `<p>Kontak<script>x()</script></p>`,
    });
    expect(await getSettingsGroup("pages")).toEqual({ about: `<h2>Tentang</h2><img src="${own}" alt="Tim" />`, contact: "<p>Kontak</p>" });
  });
});
