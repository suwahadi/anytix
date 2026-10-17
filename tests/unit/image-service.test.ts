import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectImageType, toWebpVariants } from "@/lib/image-service";

const image = (width: number, height: number, format: "png" | "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    [format]()
    .toBuffer();

describe("image-service", () => {
  it("detects types by magic bytes", async () => {
    expect(detectImageType(await image(10, 10, "png"))).toBe("png");
    expect(detectImageType(await image(10, 10, "jpeg"))).toBe("jpeg");
    expect(detectImageType(Buffer.from("hello"))).toBeNull();
    expect(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
  });

  it("does not enlarge", async () => {
    const v = await toWebpVariants(await image(500, 300, "png"));
    const widths = await Promise.all([v.lg, v.md, v.thumb].map(async (b) => (await sharp(b).metadata()).width));
    expect(widths).toEqual([500, 500, 400]);
  });

  it("downsizes large images to the variant widths", async () => {
    const v = await toWebpVariants(await image(2400, 1200, "jpeg"));
    const meta = await Promise.all([v.lg, v.md, v.thumb].map((b) => sharp(b).metadata()));
    expect(meta.map((m) => [m.width, m.height])).toEqual([[1600, 800], [800, 400], [400, 200]]);
  });

  it("outputs webp", async () => {
    const v = await toWebpVariants(await image(50, 50, "png"));
    expect(detectImageType(v.lg)).toBe("webp");
  });
});
