import { Queue } from "bullmq";
import { getRedisConnection } from "./redis";
import { config } from "../config";
import prisma from "./prisma";
import { indexEmailJob } from "./elasticsearch";

let emailQueue: Queue | null = null;

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    const connection = getRedisConnection();
    emailQueue = new Queue(config.queue.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 500 },
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return emailQueue;
}

export async function ensureQueueScheduler(): Promise<void> {
  // Delayed job promotion is handled automatically by the Worker in BullMQ >= 4.18
  getEmailQueue();
}

export async function addScheduledEmailJob(jobData: {
  jobId: string;
  emailId: string;
  subject: string;
  body: string;
  recipientEmail: string;
  senderEmail: string;
  scheduledAt: string;
  userId: string;
  hourlyLimit?: number;
}) {
  const queue = getEmailQueue();
  const scheduledTime = new Date(jobData.scheduledAt).getTime();
  const delay = Math.max(0, scheduledTime - Date.now());

  const job = await queue.add("send-email", jobData, {
    delay,
    jobId: jobData.jobId,
    priority: 1,
  });

  return job;
}

export async function removeScheduledJob(bullmqJobId: string): Promise<void> {
  const queue = getEmailQueue();
  const job = await queue.getJob(bullmqJobId);
  if (job) {
    await job.remove();
  }
}

export async function getQueueStats() {
  const queue = getEmailQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

export async function closeQueue(): Promise<void> {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
  }
}

export async function recoverOrphanedJobs(): Promise<void> {
  const queue = getEmailQueue();

  const orphanedJobs = await prisma.emailJob.findMany({
    where: {
      status: { in: ["scheduled", "rate_limited"] },
    },
    include: {
      campaign: true,
    },
  });

  console.log(`Found ${orphanedJobs.length} scheduled/rate_limited jobs in DB`);

  let recovered = 0;
  let skipped = 0;

  for (const dbJob of orphanedJobs) {
    if (dbJob.bullmqJobId) {
      const existingJob = await queue.getJob(dbJob.bullmqJobId);
      if (existingJob) {
        skipped++;
        continue;
      }
    }

    const scheduledTime = new Date(dbJob.scheduledAt).getTime();
    const delay = Math.max(0, scheduledTime - Date.now());

    const campaignSettings = dbJob.campaign?.settings as { hourlyLimit?: number } | null | undefined;
    const hourlyLimit = campaignSettings?.hourlyLimit;

    const job = await queue.add("send-email", {
      jobId: dbJob.id,
      emailId: dbJob.id,
      subject: dbJob.subject,
      body: dbJob.body,
      recipientEmail: dbJob.recipientEmail,
      senderEmail: dbJob.senderEmail,
      scheduledAt: dbJob.scheduledAt.toISOString(),
      userId: dbJob.userId,
      hourlyLimit,
    }, {
      delay,
      jobId: dbJob.id,
      priority: 1,
    });

    await prisma.emailJob.update({
      where: { id: dbJob.id },
      data: { bullmqJobId: job.id as string },
    });

    await indexEmailJob({
      id: dbJob.id,
      userId: dbJob.userId,
      recipientEmail: dbJob.recipientEmail,
      senderEmail: dbJob.senderEmail,
      subject: dbJob.subject,
      body: dbJob.body,
      status: "scheduled",
      scheduledAt: dbJob.scheduledAt,
      createdAt: dbJob.createdAt,
    });

    recovered++;
  }

  console.log(`Recovery complete: ${recovered} jobs re-enqueued, ${skipped} already in queue`);
}