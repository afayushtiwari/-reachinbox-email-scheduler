import Redis from "ioredis";
import { config } from "../config";

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      redisConnection = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        tls: redisUrl.startsWith("rediss://") ? {} : undefined,
      });
    } else {
      redisConnection = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: null,
      });
    }

    redisConnection.on("error", (err) => {
      console.error("Redis connection error:", err);
    });

    redisConnection.on("connect", () => {
      console.log("Redis connected successfully");
    });
  }
  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}
