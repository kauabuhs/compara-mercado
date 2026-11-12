import type { MatchResult } from "./match";
import type { Issue } from "./validate";

/** Valor inicial do plano (seção 6); deve ser ajustado com dados reais do golden set. */
export const DEFAULT_PUBLISH_THRESHOLD = 0.9;

export type PublicationAction = "publish" | "review" | "reject";

export interface PublicationDecision {
  action: PublicationAction;
  /** Confiança final = a mais baixa entre extração e casamento. */
  confidence: number;
  reasons: string[];
}

export interface PublicationInput {
  extractionConfidence: number;
  match: MatchResult;
  issues: readonly Issue[];
  threshold?: number;
}

/**
 * Etapa 6: só publica sozinho quando a confiança é alta e nada de suspeito apareceu;
 * o restante vai para a fila de revisão. Problemas "bloqueantes" descartam o item.
 */
export function decidePublication(input: PublicationInput): PublicationDecision {
  const threshold = input.threshold ?? DEFAULT_PUBLISH_THRESHOLD;
  const confidence = Math.min(input.extractionConfidence, input.match.confidence);
  const reasons: string[] = [];

  const blockers = input.issues.filter((issue) => issue.severity === "block");
  if (blockers.length > 0) {
    return { action: "reject", confidence, reasons: blockers.map((blocker) => blocker.message) };
  }

  if (input.match.kind === "none" || input.match.productId === null) {
    reasons.push("produto não identificado");
  }
  if (confidence < threshold) {
    reasons.push(`confiança ${confidence.toFixed(2)} abaixo do limiar ${threshold}`);
  }
  for (const issue of input.issues) reasons.push(issue.message);

  return { action: reasons.length === 0 ? "publish" : "review", confidence, reasons };
}
