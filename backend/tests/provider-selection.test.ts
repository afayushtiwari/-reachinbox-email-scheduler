import { describe, it, expect } from "vitest";
import { selectProvider } from "../src/services/email";

describe("selectProvider", () => {
  it("uses the explicit provider when set", () => {
    expect(selectProvider({ explicit: "sendgrid", sendgridKey: "SG.x" })).toBe("sendgrid");
    expect(selectProvider({ explicit: "resend", resendKey: "re_x" })).toBe("resend");
    expect(selectProvider({ explicit: "mailtrap", mailtrapToken: "t" })).toBe("mailtrap");
    expect(selectProvider({ explicit: "smtp", sendgridKey: "SG.x" })).toBe("smtp");
  });

  it("ignores an unknown explicit provider and falls back to auto-detect", () => {
    expect(selectProvider({ explicit: "bogus", sendgridKey: "SG.x" })).toBe("sendgrid");
    expect(selectProvider({ explicit: "bogus" })).toBe("smtp");
  });

  it("auto-detects sendgrid when a key is present", () => {
    expect(selectProvider({ sendgridKey: "SG.abc" })).toBe("sendgrid");
  });

  it("auto-detects resend when only the resend key is present", () => {
    expect(selectProvider({ resendKey: "re_abc" })).toBe("resend");
  });

  it("auto-detects mailtrap when only the mailtrap token is present", () => {
    expect(selectProvider({ mailtrapToken: "token" })).toBe("mailtrap");
  });

  it("priority order: sendgrid > resend > mailtrap", () => {
    expect(selectProvider({ sendgridKey: "SG.x", resendKey: "re_x", mailtrapToken: "t" })).toBe("sendgrid");
    expect(selectProvider({ resendKey: "re_x", mailtrapToken: "t" })).toBe("resend");
  });

  it("falls back to smtp when nothing is configured", () => {
    expect(selectProvider({})).toBe("smtp");
  });
});