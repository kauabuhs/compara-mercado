import { normalizeGtin } from "../../../lib/gtin";
import { normalizeName, parseSize } from "../../../lib/normalize";
import { type SizeUnit, toBaseQuantity } from "../../../lib/units";
import { similarity } from "./trigram";

export interface CatalogProduct {
  id: string;
  gtin: string | null;
  canonicalName: string;
  brand: string | null;
  sizeValue: number;
  sizeUnit: SizeUnit;
}

export interface AliasRecord {
  /** null = alias global (vale para qualquer mercado) */
  storeId: string | null;
  normalizedName: string;
  productId: string;
  status: "approved" | "pending" | "rejected";
}

export interface ProductCandidate {
  rawName: string;
  storeId?: string | null;
  gtin?: string | null;
  brand?: string | null;
  sizeValue?: number | null;
  sizeUnit?: SizeUnit | null;
}

export type MatchKind = "gtin" | "alias" | "fuzzy" | "none";

export interface MatchResult {
  kind: MatchKind;
  productId: string | null;
  /** 0 a 1. GTIN = 1; alias aprovado = 0,98; fuzzy = similaridade ajustada por tamanho. */
  confidence: number;
  /** Melhores candidatos (para a fila de revisão e para a IA desempatar). */
  candidates: { productId: string; score: number }[];
}

export const ALIAS_CONFIDENCE = 0.98;
/** Abaixo disto, nem como sugestão vale a pena mostrar na revisão. */
export const MIN_CANDIDATE_SCORE = 0.3;
/** Dois candidatos mais próximos que isto são ambíguos: reduz a confiança. */
export const AMBIGUITY_MARGIN = 0.05;

function sizeFactor(candidate: ProductCandidate, product: CatalogProduct): number {
  const candidateSize =
    candidate.sizeValue && candidate.sizeUnit
      ? { value: candidate.sizeValue, unit: candidate.sizeUnit }
      : parseSize(candidate.rawName);
  if (!candidateSize) return 1; // tamanho desconhecido: não pune nem premia
  try {
    const candidateQuantity = toBaseQuantity(candidateSize.value, candidateSize.unit);
    const productQuantity = toBaseQuantity(product.sizeValue, product.sizeUnit);
    if (candidateQuantity.base !== productQuantity.base) return 0.4;
    return Math.abs(candidateQuantity.quantity - productQuantity.quantity) < 1e-6 ? 1.1 : 0.5;
  } catch {
    return 1;
  }
}

/**
 * Casa um item extraído com o catálogo. Ordem: GTIN exato → alias aprovado → trigramas.
 * Empates e baixa similaridade resultam em confiança baixa; quem decide o destino é
 * `decidePublication`. O desempate por IA acontece no worker, só sobre `candidates`.
 */
export function matchProduct(
  candidate: ProductCandidate,
  catalog: readonly CatalogProduct[],
  aliases: readonly AliasRecord[] = [],
): MatchResult {
  // 1) GTIN exato
  if (candidate.gtin) {
    const gtin = normalizeGtin(candidate.gtin);
    const hit = gtin ? catalog.find((catalogProduct) => catalogProduct.gtin === gtin) : undefined;
    if (hit)
      return {
        kind: "gtin",
        productId: hit.id,
        confidence: 1,
        candidates: [{ productId: hit.id, score: 1 }],
      };
  }

  // 2) Alias conhecido (do mercado, depois global)
  const normalizedRawName = normalizeName(candidate.rawName);
  const approvedAliases = aliases.filter(
    (aliasRecord) =>
      aliasRecord.status === "approved" && aliasRecord.normalizedName === normalizedRawName,
  );
  const matchedAlias =
    approvedAliases.find(
      (aliasRecord) => aliasRecord.storeId && aliasRecord.storeId === candidate.storeId,
    ) ?? approvedAliases.find((aliasRecord) => aliasRecord.storeId === null);
  if (matchedAlias) {
    return {
      kind: "alias",
      productId: matchedAlias.productId,
      confidence: ALIAS_CONFIDENCE,
      candidates: [{ productId: matchedAlias.productId, score: ALIAS_CONFIDENCE }],
    };
  }

  // 3) Similaridade por trigramas, ajustada pelo tamanho da embalagem
  const scored = catalog
    .map((catalogProduct) => {
      const catalogText = `${catalogProduct.canonicalName} ${catalogProduct.brand ?? ""}`;
      const textSimilarity = similarity(candidate.rawName, catalogText);
      return {
        productId: catalogProduct.id,
        score: Math.min(1, textSimilarity * sizeFactor(candidate, catalogProduct)),
      };
    })
    .filter((scoredCandidate) => scoredCandidate.score >= MIN_CANDIDATE_SCORE)
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId))
    .slice(0, 5);

  const best = scored[0];
  if (!best) return { kind: "none", productId: null, confidence: 0, candidates: [] };

  const second = scored[1];
  const ambiguous = second !== undefined && best.score - second.score < AMBIGUITY_MARGIN;
  return {
    kind: "fuzzy",
    productId: best.productId,
    confidence: ambiguous ? Math.min(best.score, 0.6) : best.score,
    candidates: scored,
  };
}
