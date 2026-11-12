import { describe, expect, it } from "vitest";
import type { PriceOfferBase } from "../contracts";
import { RateLimiter } from "../middlewares/rate-limit";
import { withFreshness } from "../modules/catalog/service/catalog.freshness";

describe("RateLimiter", () => {
  it("bloqueia ao passar do limite e libera quando a janela expira", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.check("ip", 0).ok).toBe(true);
    expect(limiter.check("ip", 100).ok).toBe(true);
    const blocked = limiter.check("ip", 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(800);
    expect(limiter.check("ip", 1001).ok).toBe(true);
  });

  it("conta cada chave separadamente", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("a", 0).ok).toBe(true);
    expect(limiter.check("b", 0).ok).toBe(true);
    expect(limiter.check("a", 1).ok).toBe(false);
  });

  it("descarta chaves expiradas ao passar do teto de chaves", () => {
    const limiter = new RateLimiter(1, 1000, 2);
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("c", 5000);
    expect(limiter.check("a", 5001).ok).toBe(true);
  });
});

describe("withFreshness", () => {
  const baseOffer: PriceOfferBase = {
    storeId: "0a7a3c3e-3f19-4a53-8d44-3c0f5d6d9a01",
    productId: "6f1b1b0e-5b0e-4b7a-9d57-2d6f6c2a7e11",
    priceCents: 599,
    unitPriceCents: 599,
    promo: false,
    validTo: null,
    observedAt: "2026-11-08T12:00:00Z",
    storeName: "Mercado Teste",
    storeNeighborhood: null,
    productName: "Arroz 1kg",
    brand: null,
    sizeValue: 1,
    sizeUnit: "kg",
    baseUnit: "kg",
    categoryId: null,
  };
  const now = new Date("2026-11-09T12:00:00Z");

  it("preserva o preço e acrescenta idade e frescor", () => {
    expect(withFreshness(baseOffer, now)).toEqual({ ...baseOffer, ageDays: 1, freshness: "fresh" });
  });

  it("classifica como recente (7 dias) e desatualizado (14 dias)", () => {
    expect(withFreshness({ ...baseOffer, observedAt: "2026-11-01T12:00:00Z" }, now).freshness).toBe(
      "recent",
    );
    expect(withFreshness({ ...baseOffer, observedAt: "2026-10-20T12:00:00Z" }, now)).toMatchObject({
      freshness: "stale",
      ageDays: 20,
    });
  });
});
