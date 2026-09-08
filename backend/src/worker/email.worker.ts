import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../services/redis";
import prisma from "../services/prisma";
import { sendEmail } from "../services/email";
import { sendSlackNotification } from "../services/slack";
import {
  checkGlobalRateLimit,
  checkSenderRateLimit,
  decrementRateLimitCounters,
  getSecondsUntilNextWindow,
} from "../utils/rate-limiter";
import { updateEmailJobStatus } from "../services/elasticsearch";
import { config } from "../config";

const QUEUE_NAME = "email-scheduler";

async function processSendEmail(job: Job): Promise<any> {
  const {
    emailId,
    subject,
    body,
    recipientEmail,
    senderEmail,
    userId,
    hourlyLimit,
  } = job.data;

  console.log(`Processing job ${job.id} for ${recipientEmail}`);

  const emailRecord = await prisma.emailJob.findUnique({
    where: { id: emailId },
  });

  if (!emailRecord) {
    console.log(`Email record ${emailId} not found, skipping`);
    return { skipped: true };
  }

  if (emailRecord.status === "sent") {
    console.log(`Email ${emailId} already sent, skipping (idempotency)`);
    return { skipped: true, reason: "already_sent" };
  }

  if (emailRecord.status === "failed") {
    console.log(`Email ${emailId} previously failed, skipping`);
    return { skipped: true, reason: "previously_failed" };
  }

  await prisma.emailJob.update({
    where: { id: emailId },
    data: { status: "sending" },
  });

  const globalCheck = await checkGlobalRateLimit();
  if (!globalCheck.allowed) {
    console.log(`Global rate limit reached. Rescheduling ${emailId}`);
    const delayMs = getSecondsUntilNextWindow() * 1000 + Math.random() * 5000;

    await prisma.emailJob.update({
      where: { id: emailId },
      data: { status: "scheduled" },
    });

    await updateEmailJobStatus(emailId, { status: "scheduled" });

    await decrementRateLimitCounters(senderEmail);

    throw new Error(`Global rate limit hit, rescheduling in ${delayMs / 1000}s`);
  }

  const senderCheck = await checkSenderRateLimit(senderEmail, hourlyLimit);
  if (!senderCheck.allowed) {
    console.log(`Sender rate limit reached for ${senderEmail}. Rescheduling ${emailId}`);
    const delayMs = getSecondsUntilNextWindow() * 1000 + Math.random() * 5000;

    await prisma.emailJob.update({
      where: { id: emailId },
      data: { status: "rate_limited" },
    });

    await updateEmailJobStatus(emailId, { status: "rate_limited" });

    await decrementRateLimitCounters(senderEmail);

    await sendSlackNotification(
      userId,
      `⚠️ *Rate Limit Reached*\n\nSender: \`${senderEmail}\`\nRecipient: \`${recipientEmail}\`\nSubject: *${subject}*\n\nHourly limit of ${hourlyLimit || config.rateLimiting.maxPerHourPerSender} emails per sender has been reached. Emails will resume in the next hour window.`
    );

    throw new Error(`Sender rate limit hit for ${senderEmail}, rescheduling`);
  }

  const result = await sendEmail({
    from: senderEmail,
    to: recipientEmail,
    subject,
    html: body,
  });

  if (result.success) {
    await prisma.emailJob.update({
      where: { id: emailId },
      data: {
        status: "sent",
        sentAt: new Date(),
        errorMessage: null,
      },
    });

    await updateEmailJobStatus(emailId, {
      status: "sent",
      sentAt: new Date(),
    });

    console.log(`Email ${emailId} sent successfully to ${recipientEmail}`);

    const minDelay = config.rateLimiting.minDelayBetweenEmailsMs;
    if (minDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, minDelay));
    }

    return {
      success: true,
      messageId: result.messageId,
      previewUrl: result.previewUrl,
    };
  } else {
    await prisma.emailJob.update({
      where: { id: emailId },
      data: {
        status: "failed",
        errorMessage: result.error || "Unknown error",
      },
    });

    await updateEmailJobStatus(emailId, {
      status: "failed",
      errorMessage: result.error,
    });

    console.error(`Email ${emailId} failed: ${result.error}`);
    throw new Error(result.error || "Email send failed");
  }
}

function createWorker(): Worker {
  const connection = getRedisConnection();

  const worker = new Worker(QUEUE_NAME, processSendEmail, {
    connection,
    concurrency: config.worker.concurrency,
    limiter: {
      max: config.rateLimiting.maxPerHourPerSender,
      duration: 3600000,
    },
  });

  worker.on("completed", (job: Job) => {
    console.log(`Job ${job.id} completed for ${job.data.recipientEmail}`);
  });

  worker.on("failed", (job: Job | undefined, error: Error) => {
    if (job) {
      console.error(`Job ${job.id} failed:`, error.message);
    }
  });

  worker.on("error", (error: Error) => {
    console.error("Worker error:", error);
  });

  console.log(`Email worker started with concurrency: ${config.worker.concurrency}`);
  return worker;
}

let worker: Worker | null = null;

export function startWorker(): Worker {
  if (!worker) {
    worker = createWorker();
  }
  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
