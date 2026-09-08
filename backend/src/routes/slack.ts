import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest } from "../types";
import { authMiddleware } from "../middleware/auth";
import {
  getSlackOAuthUrl,
  exchangeSlackCode,
  saveSlackConnection,
  disconnectSlack,
} from "../services/slack";
import prisma from "../services/prisma";

const router = Router();
router.use(authMiddleware);

router.get("/connect", async (req: AuthRequest, res: Response) => {
  try {
    const state = uuidv4();
    const url = getSlackOAuthUrl(state);
    res.json({ url, state });
  } catch (error: any) {
    console.error("Slack connect error:", error);
    res.status(500).json({ error: "Failed to generate Slack OAuth URL" });
  }
});

router.post("/callback", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: "Authorization code is required" });
      return;
    }

    const tokenData = await exchangeSlackCode(code);
    await saveSlackConnection(userId, tokenData);

    res.json({
      message: "Slack connected successfully",
      teamName: tokenData.teamName,
    });
  } catch (error: any) {
    console.error("Slack callback error:", error);
    res.status(500).json({ error: "Failed to connect Slack: " + error.message });
  }
});

router.delete("/disconnect", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    await disconnectSlack(userId);
    res.json({ message: "Slack disconnected successfully" });
  } catch (error: any) {
    console.error("Slack disconnect error:", error);
    res.status(500).json({ error: "Failed to disconnect Slack" });
  }
});

router.get("/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        slackAccessToken: true,
        slackTeamName: true,
      },
    });

    res.json({
      connected: !!user?.slackAccessToken,
      teamName: user?.slackTeamName || null,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to check Slack status" });
  }
});

export default router;
