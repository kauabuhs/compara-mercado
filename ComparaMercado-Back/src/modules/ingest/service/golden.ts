import { normalizeName } from "../../../lib/normalize";

/** Item do golden set: o resultado correto conhecido de um encarte real. */
export interface GoldenItem {
  rawName: string;
  priceCents: number;
}

export interface GoldenReport {
  total: number;
  correct: number;
  /** 0 a 1. Meta da Fase 2: >= 0,90 em 50 itens. */
  accuracy: number;
  missing: GoldenItem[];
  wrongPrice: { expected: GoldenItem; actualCents: number }[];
  /** Itens extraídos que não existem no gabarito (alucinação). */
  extra: GoldenItem[];
}

export const GOLDEN_ACCURACY_TARGET = 0.9;

/**
 * Compara a extração com o gabarito. Um item só conta como correto quando nome (normalizado)
 * e preço batem. Roda a cada mudança de prompt ou modelo, no CI.
 */
export function scoreAgainstGolden(
  expected: readonly GoldenItem[],
  actual: readonly GoldenItem[],
): GoldenReport {
  const unmatchedActualByName = new Map<string, GoldenItem[]>();
  for (const actualItem of actual) {
    const normalizedName = normalizeName(actualItem.rawName);
    unmatchedActualByName.set(normalizedName, [
      ...(unmatchedActualByName.get(normalizedName) ?? []),
      actualItem,
    ]);
  }

  let correct = 0;
  const missing: GoldenItem[] = [];
  const wrongPrice: GoldenReport["wrongPrice"] = [];

  for (const expectedItem of expected) {
    const normalizedName = normalizeName(expectedItem.rawName);
    const candidates = unmatchedActualByName.get(normalizedName) ?? [];
    const exactMatchIndex = candidates.findIndex(
      (candidate) => candidate.priceCents === expectedItem.priceCents,
    );
    if (exactMatchIndex >= 0) {
      correct++;
      candidates.splice(exactMatchIndex, 1);
    } else if (candidates.length > 0) {
      const [taken] = candidates.splice(0, 1);
      if (taken) wrongPrice.push({ expected: expectedItem, actualCents: taken.priceCents });
    } else {
      missing.push(expectedItem);
    }
  }

  const extra = [...unmatchedActualByName.values()].flat();
  return {
    total: expected.length,
    correct,
    accuracy: expected.length === 0 ? 0 : correct / expected.length,
    missing,
    wrongPrice,
    extra,
  };
}
