import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZXING_WASM } from "@/lib/checkin/scan-gate";

const pkg = (path: string) => JSON.parse(readFileSync(path, "utf8")) as { version: string; dependencies?: Record<string, string> };

describe("vendored zxing wasm", () => {
  it("matches the installed zxing-wasm and cannot drift on npm update", () => {
    const version = pkg("node_modules/zxing-wasm/package.json").version;
    expect(ZXING_WASM).toBe(`/vendor/zxing_reader-${version}.wasm`);
    expect(existsSync(`public${ZXING_WASM}`)).toBe(true);
    expect(pkg("package.json").dependencies?.["barcode-detector"]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
