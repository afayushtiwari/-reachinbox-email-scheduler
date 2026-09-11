import nodemailer from "nodemailer";
import dns from "dns";
import net from "net";
import https from "https";
import { config } from "../config";

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  error?: string;
}

export type EmailProvider = "smtp" | "mailtrap" | "sendgrid" | "resend";

type ProviderFn = (msg: EmailMessage) => Promise<SendResult>;

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
}

const SMTP_TIMEOUTS = {
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 30000,
};

const lookupIPv4 = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family: number) => void,
) => {
  dns.lookup(hostname, { ...options, family: 4 }, callback);
};

export function probeConnectivity(): Promise<void> {
  console.log(
    `Mail mode: provider=${resolveProvider()}` +
      (config.smtp.host ? ` smtp=${config.smtp.host}:${config.smtp.port}` : "")
  );
  const { host, port } = config.smtp;
  return new Promise((resolve) => {
    let pending = 3;
    const finish = () => {
      pending -= 1;
      if (pending === 0) resolve();
    };

    const probeTcp = (family: number) => {
      const socket = net.connect({ host, port, family, timeout: 6000 });
      const label = family === 4 ? "IPv4" : "IPv6";
      socket.once("connect", () => {
        console.log(`  TCP ${host}:${port} [${label}]: OK`);
        socket.destroy();
      });
      socket.once("timeout", () => {
        console.log(`  TCP ${host}:${port} [${label}]: TIMEOUT`);
        socket.destroy();
      });
      socket.once("error", (err: Error) => {
        console.log(`  TCP ${host}:${port} [${label}]: ${err.message}`);
      });
      socket.on("close", finish);
    };

    probeTcp(4);
    probeTcp(6);

    const req = https.get("https://api.resend.com", { timeout: 6000 }, (res) => {
      console.log(`  TCP https://api.resend.com:443 [TLS]: OK (${res.statusCode})`);
      res.destroy();
    });
    req.on("timeout", () => {
      console.log("  TCP https://api.resend.com:443 [TLS]: TIMEOUT");
      req.destroy();
    });
    req.on("error", (err: Error) => {
      console.log(`  TCP https://api.resend.com:443 [TLS]: ${err.message}`);
    });
    req.on("close", finish);
  });
}

let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  if (config.smtp.user && config.smtp.pass && config.smtp.user !== "auto_generated") {
    console.log(`Using configured SMTP: ${config.smtp.host}:${config.smtp.port}`);
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      lookup: lookupIPv4,
      ...SMTP_TIMEOUTS,
    } as any);
    return transporter;
  }

  const testAccount = await nodemailer.createTestAccount();
  console.log("Ethereal Email account created:");
  console.log(`  User: ${testAccount.user}`);
  console.log(`  Pass: ${testAccount.pass}`);

  transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
    ...SMTP_TIMEOUTS,
  });

  return transporter;
}

async function mailtrapProvider(msg: EmailMessage): Promise<SendResult> {
  if (!config.httpMail.sandboxId) {
    const err = "MAILTRAP_SANDBOX_ID is not set (sandbox API requires /api/send/{sandbox_id})";
    console.error(err);
    return { success: false, error: err };
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(config.httpMail.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.httpMail.token}`,
          "Content-Type": "application/json",
          "User-Agent": "reachinbox-email-scheduler",
        },
        body: JSON.stringify({
          from: { email: msg.from },
          to: [{ email: msg.to }],
          subject: msg.subject,
          html: msg.html,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429 && attempt < 4) {
        console.log(`Mailtrap rate limited (429), retrying ${msg.to} in ${1000 * (attempt + 1)}ms...`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      if (!res.ok) {
        const detail = Array.isArray((data as any).errors)
          ? (data as any).errors.map((e: any) => (typeof e === "string" ? e : e.message || e)).join(", ")
          : (data as any).message || `HTTP ${res.status}`;
        console.error(`Mailtrap send failed: HTTP ${res.status} ${detail}`);
        return { success: false, error: `Mailtrap HTTP ${res.status}: ${detail}` };
      }

      const messageId = Array.isArray((data as any).message_ids) ? (data as any).message_ids[0] : undefined;
      console.log(`Email sent to ${msg.to}: ${messageId || "ok"}`);
      return { success: true, messageId };
    }

    return { success: false, error: "Mailtrap HTTP 429: rate limit persisted after retries" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function smtpProvider(msg: EmailMessage): Promise<SendResult> {
  try {
    const transport = await getTransporter();

    const info = await transport.sendMail({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`Email sent to ${msg.to}: ${info.messageId}`);
    if (previewUrl) {
      console.log(`Preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
    };
  } catch (error: any) {
    console.error(`Failed to send email to ${msg.to}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function sendgridProvider(msg: EmailMessage): Promise<SendResult> {
  if (!config.sendgrid.apiKey) {
    const err = "SENDGRID_API_KEY is not set";
    console.error(err);
    return { success: false, error: err };
  }

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.sendgrid.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: msg.from },
        subject: msg.subject,
        content: [{ type: "text/html", value: msg.html }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`SendGrid send failed: HTTP ${res.status} ${detail}`);
      return { success: false, error: `SendGrid HTTP ${res.status}: ${detail}` };
    }

    const messageId = res.headers.get("x-message-id") || undefined;
    console.log(`Email sent to ${msg.to}: ${messageId || "ok"}`);
    return { success: true, messageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function resendProvider(msg: EmailMessage): Promise<SendResult> {
  if (!config.resend.apiKey) {
    const err = "RESEND_API_KEY is not set";
    console.error(err);
    return { success: false, error: err };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: msg.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = (data as any).message || `HTTP ${res.status}`;
      console.error(`Resend send failed: HTTP ${res.status} ${detail}`);
      return { success: false, error: `Resend HTTP ${res.status}: ${detail}` };
    }

    const messageId = (data as any).id;
    console.log(`Email sent to ${msg.to}: ${messageId || "ok"}`);
    return { success: true, messageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

const providers: Record<EmailProvider, ProviderFn> = {
  smtp: smtpProvider,
  mailtrap: mailtrapProvider,
  sendgrid: sendgridProvider,
  resend: resendProvider,
};

export function resolveProvider(): EmailProvider {
  const explicit = config.mail.provider as EmailProvider;
  if (explicit && providers[explicit]) return explicit;

  if (config.sendgrid.apiKey) return "sendgrid";
  if (config.resend.apiKey) return "resend";
  if (config.httpMail.token) return "mailtrap";
  return "smtp";
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const providerName = resolveProvider();
  const provider = providers[providerName];

  return provider(message);
}