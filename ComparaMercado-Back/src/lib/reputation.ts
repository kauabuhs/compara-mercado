/**
 * Níveis de reputação da comunidade (ADR-0010): regra pura, sem banco nem HTTP.
 *
 * As faixas também existem no banco (`public.reputation_level()`), porque é ele quem decide
 * quando um autor de confiança aprova o próprio preço. A paridade entre os dois lados é testada
 * na integração (`community.integration.test.ts`). Se mudar aqui, mude a função SQL.
 */

/** Pontos mínimos de cada nível, na ordem: Novato, Colaborador, Confiável, Guardião. */
export const REPUTATION_LEVEL_THRESHOLDS = [0, 50, 200, 600] as const;

export type ReputationLevel = 0 | 1 | 2 | 3;

/** Nível para uma quantidade de pontos (pontos negativos contam como 0). */
export function reputationLevel(points: number): ReputationLevel {
  const safe = Math.max(0, Math.trunc(points));
  let level: ReputationLevel = 0;
  REPUTATION_LEVEL_THRESHOLDS.forEach((threshold, index) => {
    if (safe >= threshold) level = index as ReputationLevel;
  });
  return level;
}

/** Pontos necessários para o próximo nível, ou `null` se já está no último. */
export function nextLevelAt(points: number): number | null {
  const level = reputationLevel(points);
  return REPUTATION_LEVEL_THRESHOLDS[level + 1] ?? null;
}
