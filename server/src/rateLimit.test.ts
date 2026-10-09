import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from './rateLimit.js';

describe('checkRateLimit', () => {
  it('allows requests up to the daily limit, then rejects', () => {
    const key = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit(key, 3);
      expect(result.allowed).toBe(true);
    }
    const fourth = checkRateLimit(key, 3);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('tracks separate keys independently', () => {
    const a = `test-a-${crypto.randomUUID()}`;
    const b = `test-b-${crypto.randomUUID()}`;
    checkRateLimit(a, 1);
    const secondA = checkRateLimit(a, 1);
    const firstB = checkRateLimit(b, 1);
    expect(secondA.allowed).toBe(false);
    expect(firstB.allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    const key = `test-reset-${crypto.randomUUID()}`;
    const realNow = Date.now;
    try {
      let now = 1_000_000;
      Date.now = vi.fn(() => now);
      expect(checkRateLimit(key, 1).allowed).toBe(true);
      expect(checkRateLimit(key, 1).allowed).toBe(false);
      now += 24 * 60 * 60 * 1000 + 1;
      expect(checkRateLimit(key, 1).allowed).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});
