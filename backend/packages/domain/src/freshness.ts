export type Freshness = "fresh" | "recent" | "stale";

/** Passados 14 dias o preço é marcado como possivelmente desatualizado (valor inicial do plano). */
export const STALE_AFTER_DAYS = 14;
/** Meta do plano: pelo menos 70% dos preços exibidos com menos de 7 dias. */
export const FRESH_WITHIN_DAYS = 7;

const DAY_MS = 86_400_000;

export function ageInDays(observedAt: Date | string, now: Date = new Date()): number {
  const observedDate = typeof observedAt === "string" ? new Date(observedAt) : observedAt;
  return Math.max(0, Math.floor((now.getTime() - observedDate.getTime()) / DAY_MS));
}

export function freshnessOf(observedAt: Date | string, now: Date = new Date()): Freshness {
  const days = ageInDays(observedAt, now);
  if (days < FRESH_WITHIN_DAYS) return "fresh";
  if (days < STALE_AFTER_DAYS) return "recent";
  return "stale";
}
