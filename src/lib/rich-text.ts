import sanitizeHtml from "sanitize-html";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Only variants the upload API wrote for page images; anything else (other hosts, traversal, other kinds) is dropped. */
function isOwnPageImage(src: string | undefined): boolean {
  const base = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (!base || !src) return false;
  return new RegExp(`^${escapeRegExp(base)}/page/\\d{4}/[A-Za-z0-9_-]{12}-(lg|md|thumb)\\.webp$`).test(src);
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "blockquote", "img"],
  allowedAttributes: { a: ["href", "rel", "target"], img: ["src", "alt"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"] },
  exclusiveFilter: (frame) => frame.tag === "img" && !isOwnPageImage(frame.attribs.src),
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
};

export function sanitizeRichText(html: string): string {
  const clean = sanitizeHtml(html, OPTIONS).trim();
  return clean.replace(/<p>(\s|<br\s*\/?>)*<\/p>/g, "") === "" ? "" : clean;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** For meta descriptions; expects HTML that already went through sanitizeRichText. */
export function toPlainText(html: string, max = 160): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
