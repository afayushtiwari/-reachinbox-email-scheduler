import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest } from "../types";
import { authMiddleware } from "../middleware/auth";
import prisma from "../services/prisma";
import { addScheduledEmailJob, removeScheduledJob } from "../services/bullmq";
import { searchEmails, indexEmailJob } from "../services/elasticsearch";

const router = Router();
router.use(authMiddleware);

router.post("/schedule", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { subject, body, recipients, startTime, delayBetweenEmails, hourlyLimit, senderEmail } = req.body;

    if (!subject || !body || !recipients?.length || !startTime) {
      res.status(400).json({ error: "Missing required fields: subject, body, recipients, startTime" });
      return;
    }

    if (!Array.isArray(recipients) || !recipients.every((e: string) => typeof e === "string" && e.includes("@"))) {
      res.status(400).json({ error: "recipients must be an array of valid email addresses" });
      return;
    }

    const sender = senderEmail || req.user!.email;
    const startDate = new Date(startTime);
    if (isNaN(startDate.getTime()) || startDate.getTime() < Date.now()) {
      res.status(400).json({ error: "startTime must be a valid future date" });
      return;
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        name: `Campaign: ${subject.substring(0, 50)}`,
        settings: {
          delayBetweenEmails,
          hourlyLimit,
          senderEmail: sender,
        },
      },
    });

    const createdJobs = [];
    let currentTime = startDate.getTime();

    for (const recipient of recipients) {
      const idempotencyKey = `${userId}-${recipient}-${subject}-${Date.now()}-${uuidv4()}`;
      const emailId = uuidv4();
      const scheduledAt = new Date(currentTime);

      const emailJob = await prisma.emailJob.create({
        data: {
          id: emailId,
          userId,
          recipientEmail: recipient,
          senderEmail: sender,
          subject,
          body,
          status: "scheduled",
          scheduledAt,
          idempotencyKey,
          campaignId: campaign.id,
        },
      });

      const bullmqJob = await addScheduledEmailJob({
        jobId: emailId,
        emailId,
        subject,
        body,
        recipientEmail: recipient,
        senderEmail: sender,
        scheduledAt: scheduledAt.toISOString(),
        userId,
        hourlyLimit,
      });

      await prisma.emailJob.update({
        where: { id: emailId },
        data: { bullmqJobId: bullmqJob.id as string },
      });

      await indexEmailJob({
        id: emailId,
        userId,
        recipientEmail: recipient,
        senderEmail: sender,
        subject,
        body,
        status: "scheduled",
        scheduledAt,
        createdAt: emailJob.createdAt,
      });

      createdJobs.push({
        id: emailId,
        recipientEmail: recipient,
        scheduledAt: scheduledAt.toISOString(),
        bullmqJobId: bullmqJob.id,
      });

      currentTime += delayBetweenEmails * 1000;
    }

    res.json({
      message: `${createdJobs.length} emails scheduled successfully`,
      campaignId: campaign.id,
      jobs: createdJobs,
      firstEmailAt: createdJobs[0]?.scheduledAt,
      lastEmailAt: createdJobs[createdJobs.length - 1]?.scheduledAt,
    });
  } catch (error: any) {
    console.error("Schedule email error:", error);
    res.status(500).json({ error: "Failed to schedule emails" });
  }
});

router.get("/scheduled", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      prisma.emailJob.findMany({
        where: { userId, status: { in: ["scheduled", "rate_limited"] } },
        orderBy: { scheduledAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.emailJob.count({
        where: { userId, status: { in: ["scheduled", "rate_limited"] } },
      }),
    ]);

    res.json({ emails, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error("Get scheduled emails error:", error);
    res.status(500).json({ error: "Failed to fetch scheduled emails" });
  }
});

router.get("/sent", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      prisma.emailJob.findMany({
        where: { userId, status: { in: ["sent", "failed"] } },
        orderBy: { sentAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.emailJob.count({
        where: { userId, status: { in: ["sent", "failed"] } },
      }),
    ]);

    res.json({ emails, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error("Get sent emails error:", error);
    res.status(500).json({ error: "Failed to fetch sent emails" });
  }
});

router.get("/search", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const q = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!q) {
      res.status(400).json({ error: "Search query 'q' is required" });
      return;
    }

    const results = await searchEmails(userId, q, page, limit);
    res.json(results);
  } catch (error: any) {
    console.error("Search emails error:", error);
    res.status(500).json({ error: "Failed to search emails" });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const email = await prisma.emailJob.findFirst({
      where: { id, userId, status: "scheduled" },
    });

    if (!email) {
      res.status(404).json({ error: "Scheduled email not found" });
      return;
    }

    if (email.bullmqJobId) {
      await removeScheduledJob(email.bullmqJobId);
    }

    await prisma.emailJob.delete({ where: { id } });

    res.json({ message: "Email cancelled successfully" });
  } catch (error: any) {
    console.error("Cancel email error:", error);
    res.status(500).json({ error: "Failed to cancel email" });
  }
});

router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [scheduled, sent, failed, total] = await Promise.all([
      prisma.emailJob.count({ where: { userId, status: "scheduled" } }),
      prisma.emailJob.count({ where: { userId, status: "sent" } }),
      prisma.emailJob.count({ where: { userId, status: "failed" } }),
      prisma.emailJob.count({ where: { userId } }),
    ]);

    res.json({ scheduled, sent, failed, total });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
