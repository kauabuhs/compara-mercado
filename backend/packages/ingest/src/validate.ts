export type IssueCode =
  | "invalid_price"
  | "expired"
  | "duplicate"
  | "price_outlier_high"
  | "price_outlier_low";

export interface Issue {
  code: IssueCode;
  /** `block` = não publicar nem enviar à revisão; `review` = decisão humana. */
  severity: "block" | "review";
  message: string;
}

export interface ValidationInput {
  priceCents: number;
  unitPriceCents: number;
  validTo?: Date | null;
  now?: Date;
  /** Mediana do preço por unidade base do produto nos outros mercados (se houver). */
  medianUnitPriceCents?: number | null;
  /** Já existe observação igual (mesmo mercado, produto, preço e validade)? */
  isDuplicate?: boolean;
}

/** Quantas vezes acima/abaixo da mediana um preço vira suspeito. */
export const OUTLIER_HIGH_RATIO = 2.5;
export const OUTLIER_LOW_RATIO = 0.4;

/** Regras de sanidade da etapa 5 do pipeline. */
export function validateObservation(input: ValidationInput): Issue[] {
  const issues: Issue[] = [];
  const now = input.now ?? new Date();

  if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) {
    issues.push({ code: "invalid_price", severity: "block", message: "preço inválido" });
    return issues;
  }
  if (input.validTo && input.validTo.getTime() < now.getTime()) {
    issues.push({ code: "expired", severity: "block", message: "validade já vencida" });
  }
  if (input.isDuplicate) {
    issues.push({ code: "duplicate", severity: "block", message: "observação duplicada" });
  }
  const median = input.medianUnitPriceCents;
  if (median && median > 0) {
    const ratio = input.unitPriceCents / median;
    if (ratio > OUTLIER_HIGH_RATIO) {
      issues.push({
        code: "price_outlier_high",
        severity: "review",
        message: `preço ${ratio.toFixed(1)}x acima da mediana`,
      });
    } else if (ratio < OUTLIER_LOW_RATIO) {
      issues.push({
        code: "price_outlier_low",
        severity: "review",
        message: `preço ${ratio.toFixed(1)}x da mediana (muito abaixo)`,
      });
    }
  }
  return issues;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
