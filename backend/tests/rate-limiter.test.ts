import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeRedis, store } = vi.hoisted(() => {
  const store = new Map<string, number>();
  const fakeRedis = {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) || 0) + 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
    decr: vi.fn(async (key: string) => {
      const next = (store.get(key) || 0) - 1;
      store.set(key, next);
      return next;
    }),
    on: vi.fn(),
  };
  return { fakeRedis, store };
});

vi.mock("../src/services/redis", () => ({
  getRedisConnection: () => fakeRedis,
}));

import {
  checkGlobalRateLimit,
  checkSenderRateLimit,
  decrementRateLimitCounters,
  getSecondsUntilNextWindow,
} from "../src/utils/rate-limiter";

const GLOBAL_LIMIT = 200;

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe("checkGlobalRateLimit", () => {
  it("allows the first email and reports remaining quota", async () => {
    const res = await checkGlobalRateLimit();

    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(GLOBAL_LIMIT - 1);
    expect(res.resetsAt).toBeGreaterThan(Date.now());
  });

  it("blocks once the hourly counter exceeds the limit", async () => {
    for (let i = 0; i < GLOBAL_LIMIT; i++) {
      await checkGlobalRateLimit();
    }

    const res = await checkGlobalRateLimit();

    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it("sets a TTL the first time a new window counter is created", async () => {
    await checkGlobalRateLimit();

    expect(fakeRedis.expire).toHaveBeenCalledWith(expect.stringContaining("ratelimit:global:"), 3600);
  });
});

describe("checkSenderRateLimit", () => {
  it("enforces a per-sender/hour cap", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await checkSenderRateLimit("sender@example.com", 10);
      expect(res.allowed).toBe(true);
    }

    const res = await checkSenderRateLimit("sender@example.com", 10);
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it("keys counters separately per sender", async () => {
    await checkSenderRateLimit("a@example.com", 1);
    await checkSenderRateLimit("a@example.com", 1);
    await checkSenderRateLimit("b@example.com", 1);

    expect(fakeRedis.incr).toHaveBeenCalledWith(expect.stringContaining("ratelimit:sender:a@example.com:"));
    expect(fakeRedis.incr).toHaveBeenCalledWith(expect.stringContaining("ratelimit:sender:b@example.com:"));
  });
});

describe("decrementRateLimitCounters", () => {
  it("rolls back global and sender counters", async () => {
    await checkGlobalRateLimit();
    await checkSenderRateLimit("sender@example.com", 10);
    await decrementRateLimitCounters("sender@example.com");

    expect(fakeRedis.decr).toHaveBeenCalledTimes(2);
  });
});

describe("getSecondsUntilNextWindow", () => {
  it("returns a positive delay within one hour", () => {
    const seconds = getSecondsUntilNextWindow();
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(3600);
  });
});