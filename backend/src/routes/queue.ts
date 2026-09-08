import { Router, Response } from "express";
import { AuthRequest } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getQueueStats } from "../services/bullmq";

const router = Router();
router.use(authMiddleware);

router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error: any) {
    console.error("Queue stats error:", error);
    res.status(500).json({ error: "Failed to fetch queue stats" });
  }
});

export default router;
