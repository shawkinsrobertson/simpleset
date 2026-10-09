/**
 * In-memory per-process rate limiter, keyed by device id (with IP as a
 * backstop for a cleared/forged device id). This is deliberately simple:
 * it's an abuse backstop and, for now, the de facto "free preview" of the
 * paid parsing feature until real accounts/billing exist — not a billing
 * system itself. Revisit with a persistent store once it needs to survive
 * restarts or scale across multiple processes.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(key: string, limitPerDay: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + DAY_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limitPerDay - 1, resetAt };
  }

  if (existing.count >= limitPerDay) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limitPerDay - existing.count, resetAt: existing.resetAt };
}
