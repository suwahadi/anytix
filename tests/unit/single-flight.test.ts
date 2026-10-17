import { describe, expect, it } from "vitest";
import { singleFlight } from "@/lib/single-flight";

describe("singleFlight", () => {
  it("concurrent calls share one run", async () => {
    let runs = 0;
    const work = () => singleFlight("k1", async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 20));
      return { n: runs };
    });
    const [a, b] = await Promise.all([work(), work()]);
    expect(runs).toBe(1);
    expect(a).toBe(b);
  });

  it("key is freed after rejection", async () => {
    await expect(singleFlight("k2", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(singleFlight("k2", async () => "ok")).resolves.toBe("ok");
  });
});
