import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",

  database: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/email_scheduler",
  },

  redis: {
    url: process.env.REDIS_URL || "",
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },

  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },

  slack: {
    clientId: process.env.SLACK_CLIENT_ID || "",
    clientSecret: process.env.SLACK_CLIENT_SECRET || "",
  },

  smtp: {
    host: process.env.ETHEREAL_HOST || "smtp.ethereal.email",
    port: parseInt(process.env.ETHEREAL_PORT || "587", 10),
    user: process.env.ETHEREAL_USER || "",
    pass: process.env.ETHEREAL_PASS || "",
  },

  httpMail: {
    token: process.env.MAILTRAP_API_TOKEN || "",
    sandboxId: process.env.MAILTRAP_SANDBOX_ID || "",
    url:
      process.env.MAILTRAP_API_URL ||
      `https://sandbox.api.mailtrap.io/api/send/${process.env.MAILTRAP_SANDBOX_ID || ""}`,
  },

  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || "",
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
  },

  mail: {
    provider: process.env.MAIL_PROVIDER || "",
  },

  rateLimiting: {
    maxPerHourGlobal: parseInt(process.env.MAX_EMAILS_PER_HOUR || "200", 10),
    maxPerHourPerSender: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || "50", 10),
    minDelayBetweenEmailsMs: parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || "2000", 10),
  },

  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
  },

  queue: {
    name: "email-scheduler",
  },
};
