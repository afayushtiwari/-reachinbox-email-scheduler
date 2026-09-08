import { Router, Response } from "express";
import {
  verifyGoogleToken,
  findOrCreateUser,
  generateJWT,
  verifyJWT,
} from "../services/google-auth";
import prisma from "../services/prisma";
import { AuthRequest } from "../types";

const router = Router();

router.post("/google", async (req: AuthRequest, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({ error: "idToken is required" });
      return;
    }

    const googleUser = await verifyGoogleToken(idToken);
    const user = await findOrCreateUser(googleUser);
    const token = generateJWT(user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error: any) {
    console.error("Google auth error:", error);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

router.post("/dev-login", async (req: AuthRequest, res: Response) => {
  try {
    const { email, name } = req.body;

    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "Dev login only available in development" });
      return;
    }

    const devEmail = email || "dev@reachinbox.ai";
    const devName = name || "Developer User";

    const user = await findOrCreateUser({
      googleId: `dev-${devEmail}`,
      email: devEmail,
      name: devName,
      avatar: "",
    });

    const token = generateJWT(user.id, user.email);

    res.json({
      token,
      devMode: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error: any) {
    console.error("Dev login error:", error);
    res.status(500).json({ error: "Dev login failed" });
  }
});

router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyJWT(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        slackTeamName: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
