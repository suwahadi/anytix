import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("csv neutralises formula cells", () => {
    const out = toCsv(["a"], [["=HYPERLINK(\"x\")"], ["+6281"], ["-1+2"], ["@SUM(A1)"], ["\tx"], ["\rx"], [-5], ["aman"]]);
    const lines = out.replace(/^﻿/, "").split("\r\n");
    expect(lines.slice(1, 9)).toEqual(['"\'=HYPERLINK(""x"")"', "'+6281", "'-1+2", "'@SUM(A1)", "'\tx", "\"'\rx\"", "-5", "aman"]);
  });

  it("quotes commas quotes and newlines", () => {
    const out = toCsv(["Nama", "Catatan"], [["Budi, S.", 'kata "hai"'], ["baris\nbaru", null]]);
    expect(out).toBe('﻿Nama,Catatan\r\n"Budi, S.","kata ""hai"""\r\n"baris\nbaru",\r\n');
  });
});
