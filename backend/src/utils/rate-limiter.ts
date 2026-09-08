import { getRedisConnection } from "../services/redis";
import { config } from "../config";

function getCurrentHourWindow(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hour = String(now.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}-${hour}`;
}

function getNextHourWindow(): { key: string; timestamp: number } {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return {
    key: getCurrentHourWindow(),
    timestamp: nextHour.getTime(),
  };
}

export async function checkGlobalRateLimit(): Promise<{
  allowed: boolean;
  remaining: number;
  resetsAt: number;
}> {
  const redis = getRedisConnection();
  const window = getCurrentHourWindow();
  const key = `ratelimit:global:${window}`;
  const maxPerHour = config.rateLimiting.maxPerHourGlobal;

  const current = await redis.incr(key);
  if (current === 1) {
    const ttl = 3600;
    await redis.expire(key, ttl);
  }

  const remaining = Math.max(0, maxPerHour - current);
  const { timestamp: resetsAt } = getNextHourWindow();

  return {
    allowed: current <= maxPerHour,
    remaining,
    resetsAt,
  };
}

export async function checkSenderRateLimit(
  senderEmail: string,
  maxPerHour?: number
): Promise<{ allowed: boolean; remaining: number; resetsAt: number }> {
  const redis = getRedisConnection();
  const window = getCurrentHourWindow();
  const key = `ratelimit:sender:${senderEmail}:${window}`;
  const limit = maxPerHour || config.rateLimiting.maxPerHourPerSender;

  const current = await redis.incr(key);
  if (current === 1) {
    const ttl = 3600;
    await redis.expire(key, ttl);
  }

  const remaining = Math.max(0, limit - current);
  const { timestamp: resetsAt } = getNextHourWindow();

  return {
    allowed: current <= limit,
    remaining,
    resetsAt,
  };
}

export async function decrementRateLimitCounters(
  senderEmail: string
): Promise<void> {
  const redis = getRedisConnection();
  const window = getCurrentHourWindow();

  await redis.decr(`ratelimit:global:${window}`);
  await redis.decr(`ratelimit:sender:${senderEmail}:${window}`);
}

export function getSecondsUntilNextWindow(): number {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return Math.ceil((nextHour.getTime() - now.getTime()) / 1000);
}
