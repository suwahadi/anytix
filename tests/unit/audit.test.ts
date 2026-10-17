import { describe, expect, it } from "vitest";
import { diffFields } from "@/lib/audit";

describe("diffFields", () => {
  it("lists only changed keys as [before, after]", () => {
    expect(
      diffFields(
        { title: "A", price: 1000, tags: ["x"], same: 1 },
        { title: "B", price: 1000, tags: ["x", "y"], same: 1 },
      ),
    ).toEqual({ title: ["A", "B"], tags: [["x"], ["x", "y"]] });
  });

  it("treats a missing before value as a change", () => {
    expect(diffFields({}, { name: "Baru" })).toEqual({ name: [undefined, "Baru"] });
  });
});
