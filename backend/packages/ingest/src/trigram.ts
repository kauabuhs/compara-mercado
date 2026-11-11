import { normalizeName } from "@compara/domain";

/** Trigramas no mesmo esquema do pg_trgm: palavras com 2 espaços antes e 1 depois. */
export function trigrams(text: string): Set<string> {
  const trigramSet = new Set<string>();
  for (const word of normalizeName(text).split(" ")) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i <= padded.length - 3; i++) trigramSet.add(padded.slice(i, i + 3));
  }
  return trigramSet;
}

/** Similaridade de Jaccard entre conjuntos de trigramas (0 a 1), como `similarity()` do pg_trgm. */
export function similarity(left: string, right: string): number {
  const leftTrigrams = trigrams(left);
  const rightTrigrams = trigrams(right);
  if (leftTrigrams.size === 0 || rightTrigrams.size === 0) return 0;
  let sharedCount = 0;
  for (const trigram of leftTrigrams) if (rightTrigrams.has(trigram)) sharedCount++;
  return sharedCount / (leftTrigrams.size + rightTrigrams.size - sharedCount);
}
