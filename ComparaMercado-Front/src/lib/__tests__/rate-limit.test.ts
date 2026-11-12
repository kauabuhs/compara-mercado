import { describe, expect, it } from "vitest";
import { RateLimiter } from "../rate-limit";

describe("RateLimiter", () => {
  it("permite até o limite e bloqueia depois, informando quando tentar de novo", () => {
    const rateLimiter = new RateLimiter(2, 1000);
    expect(rateLimiter.check("ip", 0).ok).toBe(true);
    expect(rateLimiter.check("ip", 100).ok).toBe(true);
    const blocked = rateLimiter.check("ip", 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(800);
  });

  it("libera depois da janela e isola chaves diferentes", () => {
    const rateLimiter = new RateLimiter(1, 1000);
    expect(rateLimiter.check("a", 0).ok).toBe(true);
    expect(rateLimiter.check("b", 0).ok).toBe(true);
    expect(rateLimiter.check("a", 500).ok).toBe(false);
    expect(rateLimiter.check("a", 1001).ok).toBe(true);
  });
});
