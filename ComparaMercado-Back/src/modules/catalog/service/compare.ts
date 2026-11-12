import type { Cents } from "../../../lib/money";

export interface ListItem {
  productId: string;
  quantity: number;
}

export interface PriceEntry {
  storeId: string;
  productId: string;
  priceCents: Cents;
}

export interface StoreRef {
  storeId: string;
  /** Distância do usuário em metros, se a localização foi informada. */
  distanceMeters?: number | null;
}

export interface StoreTotal {
  storeId: string;
  totalCents: Cents;
  foundCount: number;
  missingProductIds: string[];
  /** true quando o mercado tem preço para todos os itens da lista. */
  complete: boolean;
  distanceMeters: number | null;
}

export interface SplitAssignment {
  productId: string;
  storeId: string;
  priceCents: Cents;
  quantity: number;
}

export interface SplitResult {
  storeIds: [string, string];
  totalCents: Cents;
  assignments: SplitAssignment[];
  missingProductIds: string[];
  /** Quanto economiza em relação ao melhor mercado único. */
  savingsCents: Cents;
  /** Distância adicional (ida a dois mercados vs. só ao melhor único); null sem localização. */
  extraDistanceMeters: number | null;
}

export interface ListComparison {
  stores: StoreTotal[];
  bestSingle: StoreTotal | null;
  /** Só existe quando dividir a compra entre dois mercados realmente economiza. */
  bestSplit: SplitResult | null;
}

type PriceIndex = Map<string, Map<string, Cents>>;

/**
 * Compara uma lista entre mercados. Espelha a função SQL `compare_list`
 * (ComparaMercado-Back/supabase/migrations); serve ao modo demo, aos testes e como especificação executável.
 *
 * Ordenação: menos itens faltando primeiro, depois menor total, depois mais perto.
 */
export function compareList(
  items: readonly ListItem[],
  prices: readonly PriceEntry[],
  stores: readonly StoreRef[],
): ListComparison {
  const mergedItems = mergeItems(items);
  const lowestPriceIndex: PriceIndex = new Map();
  for (const entry of prices) {
    const storePrices = lowestPriceIndex.get(entry.storeId) ?? new Map<string, Cents>();
    lowestPriceIndex.set(entry.storeId, storePrices);
    const currentLowestPrice = storePrices.get(entry.productId);
    if (currentLowestPrice === undefined || entry.priceCents < currentLowestPrice) {
      storePrices.set(entry.productId, entry.priceCents);
    }
  }

  const totals: StoreTotal[] = stores.map((store) => {
    const storePrices = lowestPriceIndex.get(store.storeId);
    let totalCents = 0;
    let foundCount = 0;
    const missingProductIds: string[] = [];
    for (const item of mergedItems) {
      const priceCents = storePrices?.get(item.productId);
      if (priceCents === undefined) missingProductIds.push(item.productId);
      else {
        totalCents += priceCents * item.quantity;
        foundCount++;
      }
    }
    return {
      storeId: store.storeId,
      totalCents,
      foundCount,
      missingProductIds,
      complete: missingProductIds.length === 0 && mergedItems.length > 0,
      distanceMeters: store.distanceMeters ?? null,
    };
  });

  totals.sort(byRank);
  const bestSingle = totals.find((storeTotal) => storeTotal.foundCount > 0) ?? null;

  return {
    stores: totals,
    bestSingle,
    bestSplit: findBestSplit(mergedItems, lowestPriceIndex, totals, bestSingle),
  };
}

function byRank(a: StoreTotal, b: StoreTotal): number {
  return (
    a.missingProductIds.length - b.missingProductIds.length ||
    a.totalCents - b.totalCents ||
    (a.distanceMeters ?? Number.POSITIVE_INFINITY) -
      (b.distanceMeters ?? Number.POSITIVE_INFINITY) ||
    a.storeId.localeCompare(b.storeId)
  );
}

function mergeItems(items: readonly ListItem[]): ListItem[] {
  const quantityByProductId = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;
    quantityByProductId.set(
      item.productId,
      (quantityByProductId.get(item.productId) ?? 0) + item.quantity,
    );
  }
  return [...quantityByProductId].map(([productId, quantity]) => ({ productId, quantity }));
}

function findBestSplit(
  items: readonly ListItem[],
  lowestPriceIndex: PriceIndex,
  totals: readonly StoreTotal[],
  bestSingle: StoreTotal | null,
): SplitResult | null {
  if (!bestSingle || totals.length < 2) return null;

  let bestSplit: SplitResult | null = null;

  for (let i = 0; i < totals.length; i++) {
    for (let j = i + 1; j < totals.length; j++) {
      const firstStore = totals[i];
      const secondStore = totals[j];
      if (!firstStore || !secondStore) continue;
      const firstStorePrices = lowestPriceIndex.get(firstStore.storeId);
      const secondStorePrices = lowestPriceIndex.get(secondStore.storeId);
      const assignments: SplitAssignment[] = [];
      const missingProductIds: string[] = [];
      let totalCents = 0;
      for (const item of items) {
        const firstStorePrice = firstStorePrices?.get(item.productId);
        const secondStorePrice = secondStorePrices?.get(item.productId);
        if (firstStorePrice === undefined && secondStorePrice === undefined) {
          missingProductIds.push(item.productId);
          continue;
        }
        const isFirstStoreCheaper =
          secondStorePrice === undefined ||
          (firstStorePrice !== undefined && firstStorePrice <= secondStorePrice);
        const priceCents = (isFirstStoreCheaper ? firstStorePrice : secondStorePrice) ?? 0;
        totalCents += priceCents * item.quantity;
        assignments.push({
          productId: item.productId,
          storeId: isFirstStoreCheaper ? firstStore.storeId : secondStore.storeId,
          priceCents,
          quantity: item.quantity,
        });
      }
      // Dividir só faz sentido se de fato usa os dois mercados
      if (new Set(assignments.map((assignment) => assignment.storeId)).size < 2) continue;

      const isBetterThanCurrentBest =
        !bestSplit ||
        missingProductIds.length < bestSplit.missingProductIds.length ||
        (missingProductIds.length === bestSplit.missingProductIds.length &&
          totalCents < bestSplit.totalCents);
      if (isBetterThanCurrentBest) {
        const singleStoreDistance = bestSingle.distanceMeters;
        const firstDistance = firstStore.distanceMeters;
        const secondDistance = secondStore.distanceMeters;
        bestSplit = {
          storeIds: [firstStore.storeId, secondStore.storeId],
          totalCents,
          assignments,
          missingProductIds,
          savingsCents: 0,
          extraDistanceMeters:
            firstDistance !== null && secondDistance !== null && singleStoreDistance !== null
              ? Math.max(0, firstDistance + secondDistance - singleStoreDistance)
              : null,
        };
      }
    }
  }

  if (!bestSplit) return null;
  // Só devolve a divisão se cobre ao menos os mesmos itens e custa menos que o melhor único
  if (bestSplit.missingProductIds.length > bestSingle.missingProductIds.length) return null;
  const savingsCents = bestSingle.totalCents - bestSplit.totalCents;
  if (
    bestSplit.missingProductIds.length === bestSingle.missingProductIds.length &&
    savingsCents <= 0
  ) {
    return null;
  }
  return { ...bestSplit, savingsCents: Math.max(0, savingsCents) };
}
