import type { TokenUsage } from "./provider";

/** Preço de tabela em centavos de dólar por milhão de tokens. */
export interface ModelPricing {
  inputUsdCentsPerMTok: number;
  outputUsdCentsPerMTok: number;
}

// Valores de tabela (US$/MTok) em novembro de 2026: confirme no site do provedor antes de confiar.
export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-5-5": { inputUsdCentsPerMTok: 400, outputUsdCentsPerMTok: 2000 },
  "claude-sonnet-5-5": { inputUsdCentsPerMTok: 200, outputUsdCentsPerMTok: 1000 },
  "claude-haiku-5-5": { inputUsdCentsPerMTok: 10, outputUsdCentsPerMTok: 50 },
};

/** Custo estimado em centavos de dólar (fracionário). Modelo desconhecido => erro explícito. */
export function estimateCostUsdCents(model: string, usage: TokenUsage): number {
  const pricing = PRICING[model];
  if (!pricing) throw new Error(`sem tabela de preço para o modelo "${model}"`);
  return (
    (usage.inputTokens * pricing.inputUsdCentsPerMTok +
      usage.outputTokens * pricing.outputUsdCentsPerMTok) /
    1_000_000
  );
}

/** Teto mensal de gasto com IA. O worker consulta antes de cada job e alerta ao se aproximar. */
export class BudgetGuard {
  constructor(
    private readonly monthlyLimitUsdCents: number,
    private spentUsdCents = 0,
  ) {}

  get spent(): number {
    return this.spentUsdCents;
  }

  get remaining(): number {
    return Math.max(0, this.monthlyLimitUsdCents - this.spentUsdCents);
  }

  /** true quando já passou de `fraction` do teto (padrão 80%): hora de alertar. */
  nearLimit(fraction = 0.8): boolean {
    return this.spentUsdCents >= this.monthlyLimitUsdCents * fraction;
  }

  canSpend(estimateUsdCents: number): boolean {
    return this.spentUsdCents + estimateUsdCents <= this.monthlyLimitUsdCents;
  }

  record(usdCents: number): void {
    this.spentUsdCents += usdCents;
  }
}
