import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/security/rateLimiter";

describe("RateLimiter", () => {
  it("allows up to the ceiling then refuses", () => {
    const limiter = new RateLimiter(3, 60_000);

    expect(limiter.check("ip", 1000).allowed).toBe(true);
    expect(limiter.check("ip", 1100).allowed).toBe(true);
    expect(limiter.check("ip", 1200).allowed).toBe(true);

    const refused = limiter.check("ip", 1300);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys are independent", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("a", 1000).allowed).toBe(true);
    expect(limiter.check("b", 1000).allowed).toBe(true);
    expect(limiter.check("a", 1000).allowed).toBe(false);
  });

  it("lets the window slide", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 500).allowed).toBe(false);
    expect(limiter.check("ip", 1500).allowed).toBe(true);
  });

  it("reports the wait left rather than a flat value", () => {
    const limiter = new RateLimiter(1, 10_000);
    limiter.check("ip", 0);
    expect(limiter.check("ip", 2000).retryAfterSeconds).toBe(8);
    expect(limiter.check("ip", 9500).retryAfterSeconds).toBe(1);
  });

  it("prune drops keys with no recent hit", () => {
    const limiter = new RateLimiter(5, 1000);
    limiter.check("old", 0);
    limiter.check("fresh", 900);
    expect(limiter.size()).toBe(2);

    limiter.prune(1500);

    expect(limiter.size()).toBe(1);
    expect(limiter.check("old", 1500).allowed).toBe(true);
  });
});
