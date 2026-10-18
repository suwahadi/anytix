import { describe, expect, it } from "vitest";
import { assertDbTestsAllowed, assertDbWriteAllowed } from "@/lib/db-guard";

describe("database guards", () => {
  it("db tests refuse without opt-in", () => {
    for (const value of [undefined, "false", "1", "TRUE"]) {
      expect(() => assertDbTestsAllowed({ DB_TESTS_ALLOWED: value })).toThrow(
        "DB tests are disabled for this database. Set DB_TESTS_ALLOWED=true only for a non-production database.",
      );
    }
  });

  it("db tests run with opt-in", () => {
    expect(() => assertDbTestsAllowed({ DB_TESTS_ALLOWED: "true" })).not.toThrow();
  });

  it("db scripts refuse without opt-in", () => {
    expect(() => assertDbWriteAllowed({}, "migrate")).toThrow(/migrate/);
    expect(() => assertDbWriteAllowed({ DB_WRITE_ALLOWED: "yes" }, "reset-dev-data")).toThrow(/DB_WRITE_ALLOWED=true/);
    expect(() => assertDbWriteAllowed({ DB_WRITE_ALLOWED: "true" }, "migrate")).not.toThrow();
  });
});
