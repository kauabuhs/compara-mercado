import type { PriceOffer, PriceOfferBase } from "../../../contracts";
import { ageInDays, freshnessOf } from "../../../lib/freshness";

/**
 * Acrescenta idade e frescor ao preço. A regra (7 e 14 dias) vive em `src/lib/freshness.ts`; o
 * front-end só exibe o que a API devolve.
 */
export function withFreshness(offer: PriceOfferBase, now: Date): PriceOffer {
  return {
    ...offer,
    ageDays: ageInDays(offer.observedAt, now),
    freshness: freshnessOf(offer.observedAt, now),
  };
}
