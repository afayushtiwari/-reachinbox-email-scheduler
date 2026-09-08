import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { config } from "./config";
import prisma from "./services/prisma";
import { getRedisConnection } from "./services/redis";
import { initializeElasticsearch } from "./services/elasticsearch";
import { ensureQueueScheduler, recoverOrphanedJobs } from "./services/bullmq";
import { startWorker } from "./worker/email.worker";
import authRoutes from "./routes/auth";
import emailRoutes from "./routes/emails";
import slackRoutes from "./routes/slack";
import queueRoutes from "./routes/queue";

const app = express();

app.use(cors({
  origin: config.frontendUrl === "true" ? true : config.frontendUrl,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/slack", slackRoutes);
app.use("/api/queue", queueRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = getRedisConnection();
    await redis.ping();
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(503).json({ status: "unhealthy", error: error.message });
  }
});

// Serve the static frontend build (if present) for single-service hosting
const frontendOut = path.resolve(__dirname, "../../frontend/out");
if (fs.existsSync(frontendOut)) {
  app.use(express.static(frontendOut));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      return next();
    }
    // Map clean URLs (e.g. /login -> login.html) like a static host would.
    const cleanPath = req.path.replace(/\/+$/, "") || "/";
    const htmlFile = path.join(frontendOut, `${cleanPath}.html`);
    if (fs.existsSync(htmlFile) && fs.statSync(htmlFile).isFile()) {
      return res.sendFile(htmlFile);
    }
    res.sendFile(path.join(frontendOut, "index.html"));
  });
  console.log("Serving frontend from:", frontendOut);
} else {
  console.log("Frontend build not found, API only mode:", frontendOut);
}

async function startServer() {
  try {
    console.log("Connecting to database...");
    await prisma.$connect();
    console.log("Database connected");

    console.log("Connecting to Redis...");
    getRedisConnection();
    console.log("Redis connected");

    console.log("Initializing Elasticsearch...");
    await initializeElasticsearch();
    console.log("Elasticsearch initialized");

    console.log("Starting queue scheduler...");
    await ensureQueueScheduler();
    console.log("Queue scheduler started");

    console.log("Recovering orphaned jobs...");
    await recoverOrphanedJobs();
    console.log("Job recovery complete");

    console.log("Starting email worker...");
    startWorker();
    console.log("Worker started");

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/api/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
