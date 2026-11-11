import type { PriceOffer, PriceOfferBase } from "@compara/contracts";
import { ageInDays, freshnessOf } from "@compara/domain";

/**
 * Acrescenta idade e frescor ao preço. A regra (7 e 14 dias) vive em `@compara/domain`; o
 * front-end só exibe o que a API devolve.
 */
export function withFreshness(offer: PriceOfferBase, now: Date): PriceOffer {
  return {
    ...offer,
    ageDays: ageInDays(offer.observedAt, now),
    freshness: freshnessOf(offer.observedAt, now),
  };
}
