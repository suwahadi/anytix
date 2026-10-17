import { describe, expect, it } from "vitest";
import { getTransactionSettings } from "@/lib/settings";

describe("settings", () => {
  it("reads transaction defaults", async () => {
    const s = await getTransactionSettings();
    expect(s).toMatchObject({ holdMinutes: 3, payMinutes: 15, payGraceMinutes: 5, serviceFee: 5000 });
    expect(s.paymentMethods.qris).toBe(true);
    expect(s.paymentMethods.va.bca).toBe(true);
  });
});
