import dotenv from "dotenv";
dotenv.config();

import { startWorker, stopWorker } from "./email.worker";
import { getRedisConnection } from "../services/redis";
import { ensureQueueScheduler, recoverOrphanedJobs } from "../services/bullmq";
import prisma from "../services/prisma";

async function main() {
  console.log("Starting email worker...");

  await prisma.$connect();
  console.log("Database connected");

  const connection = getRedisConnection();
  console.log("Redis connected");

  await ensureQueueScheduler();
  console.log("Queue scheduler started");

  console.log("Recovering orphaned jobs...");
  await recoverOrphanedJobs();
  console.log("Job recovery complete");

  const worker = startWorker();
  console.log("Worker started and listening for jobs");

  const shutdown = async () => {
    console.log("Shutting down worker...");
    await stopWorker();
    const { closeQueue } = await import("../services/bullmq");
    await closeQueue();
    await prisma.$disconnect();
    await connection.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Worker startup failed:", err);
  process.exit(1);
});
