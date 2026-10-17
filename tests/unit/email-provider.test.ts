import { describe, expect, it } from "vitest";
import { resolveSmtpConfig } from "@/lib/email/email-provider";

const env = {
  SMTP_HOST: "smtp-relay.brevo.com",
  SMTP_PORT: "587",
  SMTP_USER: "env-user",
  SMTP_PASS: "env-pass",
  SMTP_FROM: "Anytix <noreply@env.test>",
};

describe("resolveSmtpConfig", () => {
  it("prefers complete stored settings", () => {
    const cfg = resolveSmtpConfig(
      { host: "mail.panel.test", port: 465, user: "panel", from: "Panel <a@panel.test>", password: "rahasia" },
      env,
    );
    expect(cfg).toEqual({
      host: "mail.panel.test",
      port: 465,
      secure: true,
      user: "panel",
      pass: "rahasia",
      from: "Panel <a@panel.test>",
    });
  });

  it("falls back to env when stored settings lack a password", () => {
    const cfg = resolveSmtpConfig({ host: "mail.panel.test", port: 587, user: "panel", from: "x@y.test", password: null }, env);
    expect(cfg).toMatchObject({ host: "smtp-relay.brevo.com", port: 587, secure: false, user: "env-user", pass: "env-pass" });
  });

  it("returns null without any usable config", () => {
    expect(resolveSmtpConfig(null, {})).toBeNull();
    expect(resolveSmtpConfig({}, { SMTP_HOST: "h" })).toBeNull();
  });
});
