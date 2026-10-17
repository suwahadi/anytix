import { describe, expect, it } from "vitest";
import { createSessionValue, readSessionValue } from "@/lib/admin-session";
import { newVisitorCookie, readVisitorId } from "@/lib/visitor";

const HOUR = 3_600_000;
const t = 1_800_000_000_000;

describe("admin session value", () => {
  it("roundtrip", () => {
    expect(readSessionValue(createSessionValue(7, t, 12 * HOUR), t + HOUR)).toBe(7);
  });

  it("expired", () => {
    expect(readSessionValue(createSessionValue(7, t, 12 * HOUR), t + 13 * HOUR)).toBeNull();
  });

  it("a pending 2fa value is not a session", () => {
    const pending = createSessionValue(7, t, 5 * 60_000, "2fa");
    expect(readSessionValue(pending, t + 1000)).toBeNull();
    expect(readSessionValue(pending, t + 1000, "2fa")).toBe(7);
  });

  it("tampered", () => {
    const value = createSessionValue(7, t, 12 * HOUR);
    expect(value.startsWith("session.7.")).toBe(true);
    expect(readSessionValue(value.replace(/^session\.7\./, "session.8."), t + HOUR)).toBeNull();
    expect(readSessionValue(undefined, t)).toBeNull();
    expect(readSessionValue("garbage", t)).toBeNull();
  });
});

describe("visitor cookie", () => {
  it("roundtrip", () => {
    const { id, value } = newVisitorCookie();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(readVisitorId(value)).toBe(id);
  });

  it("rejects forged or malformed values", () => {
    expect(readVisitorId("abc.def")).toBeNull();
    expect(readVisitorId(undefined)).toBeNull();
    const { value } = newVisitorCookie();
    expect(readVisitorId(`00000000-0000-4000-8000-000000000000.${value.split(".")[1]}`)).toBeNull();
  });
});
