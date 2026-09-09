import nodemailer from "nodemailer";
import { config } from "../config";

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
      ...SMTP_TIMEOUTS,
    });
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

export async function sendEmail(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; messageId?: string; previewUrl?: string; error?: string }> {
  try {
    const transport = await getTransporter();

    const info = await transport.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`Email sent to ${options.to}: ${info.messageId}`);
    if (previewUrl) {
      console.log(`Preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
    };
  } catch (error: any) {
    console.error(`Failed to send email to ${options.to}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
