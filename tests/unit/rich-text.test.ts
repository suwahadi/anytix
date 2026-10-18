import { describe, expect, it } from "vitest";
import { sanitizeRichText, toPlainText } from "@/lib/rich-text";

describe("sanitizeRichText", () => {
  it("strips active content", () => {
    const out = sanitizeRichText(
      `<p onclick="x()">Hai<script>alert(1)</script></p><a href="javascript:alert(1)">x</a>` +
        `<img src=x onerror=alert(1)><a href="https://a.id">ok</a>`,
    );
    expect(out).toContain("<p>Hai</p>");
    expect(out).not.toMatch(/script|onclick|onerror|<img|javascript:/i);
    expect(out).toContain('href="https://a.id"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it("keeps allowed formatting and drops styles", () => {
    const out = sanitizeRichText(`<h2 style="color:red" class="x">Judul</h2><ul><li><strong>Satu</strong></li></ul>`);
    expect(out).toBe("<h2>Judul</h2><ul><li><strong>Satu</strong></li></ul>");
  });

  it("keeps images only from our own media storage", () => {
    const own = `${process.env.NEXT_PUBLIC_MEDIA_BASE_URL}/page/2026/abcdefghijkl-lg.webp`;
    const out = sanitizeRichText(
      `<p>a</p><img src="${own}" alt="Panggung" onerror="x()" width="9"><img src="https://evil.example/a.webp" alt="x"><img src="${own}/../../x">`,
    );
    expect(out).toBe(`<p>a</p><img src="${own}" alt="Panggung" />`);
  });

  it("returns empty string for empty editor output", () => {
    expect(sanitizeRichText("<p></p>")).toBe("");
    expect(sanitizeRichText("")).toBe("");
  });
});

describe("toPlainText", () => {
  it("strips tags, decodes entities and separates blocks", () => {
    expect(toPlainText("<h2>Jazz</h2><p>Musik &amp; kuliner<br>di taman</p>")).toBe("Jazz Musik & kuliner di taman");
  });

  it("cuts long text with an ellipsis", () => {
    expect(toPlainText("<p>" + "a".repeat(200) + "</p>", 10)).toBe("aaaaaaaaa…");
  });
});
