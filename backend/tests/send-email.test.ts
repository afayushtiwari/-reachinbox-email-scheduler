import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import type { EmailMessage } from "../src/services/email";

let sendgridProvider: (msg: EmailMessage) => Promise<any>;
let resendProvider: (msg: EmailMessage) => Promise<any>;
let sendEmail: (msg: EmailMessage) => Promise<any>;

const msg: EmailMessage = {
  from: "noreply@example.com",
  to: "user@gmail.com",
  subject: "Hello",
  html: "<p>hello</p>",
};

beforeAll(async () => {
  process.env.SENDGRID_API_KEY = "SG.test";
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_PROVIDER = "sendgrid";
  const m = await import("../src/services/email");
  sendgridProvider = m.sendgridProvider;
  resendProvider = m.resendProvider;
  sendEmail = m.sendEmail;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendgridProvider", () => {
  it("returns success with the message id from x-message-id header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "SG_abc123" },
      })
    );

    const res = await sendgridProvider(msg);

    expect(res.success).toBe(true);
    expect(res.messageId).toBe("SG_abc123");
  });

  it("returns a structured error on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("unauthorized"),
      })
    );

    const res = await sendgridProvider(msg);

    expect(res.success).toBe(false);
    expect(res.error).toContain("401");
  });
});

describe("resendProvider", () => {
  it("returns success with the message id from the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "re_msg_1" }),
      })
    );

    const res = await resendProvider(msg);

    expect(res.success).toBe(true);
    expect(res.messageId).toBe("re_msg_1");
  });

  it("returns a structured error on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ message: "missing from" }),
      })
    );

    const res = await resendProvider(msg);

    expect(res.success).toBe(false);
    expect(res.error).toContain("422");
  });
});

describe("sendEmail facade", () => {
  it("dispatches to the selected provider (sendgrid) and returns a SendResult", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "SG_facade" },
      })
    );

    const res = await sendEmail(msg);

    expect(res.success).toBe(true);
    expect(res.messageId).toBe("SG_facade");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});