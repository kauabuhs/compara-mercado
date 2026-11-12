/**
 * Busca local "inteligente" para filtrar listas já carregadas no aparelho (ofertas, mercados,
 * resultados): ignora acentos e maiúsculas, aceita só o começo da palavra ("arr" acha "Arroz"),
 * tolera uma letra errada/faltando/trocada ("leiet" acha "Leite") e ordena por relevância.
 * Todas as palavras digitadas precisam aparecer (E), em qualquer ordem e em qualquer campo.
 */

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(" ") : [];
}

/** Distância de edição <= 1 (troca, falta, sobra ou duas letras vizinhas invertidas). */
function isWithinOneEdit(first: string, second: string): boolean {
  if (first === second) return true;
  const lengthGap = first.length - second.length;
  if (Math.abs(lengthGap) > 1) return false;

  if (lengthGap === 0) {
    const mismatches: number[] = [];
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) mismatches.push(index);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length === 1) return true;
    const [firstIndex, secondIndex] = mismatches;
    return (
      mismatches.length === 2 &&
      secondIndex === (firstIndex ?? 0) + 1 &&
      first[firstIndex ?? 0] === second[secondIndex ?? 0] &&
      first[secondIndex ?? 0] === second[firstIndex ?? 0]
    );
  }

  const [shorter, longer] = lengthGap < 0 ? [first, second] : [second, first];
  let index = 0;
  while (index < shorter.length && shorter[index] === longer[index]) index += 1;
  return shorter.slice(index) === longer.slice(index + 1);
}

const MIN_FUZZY_LENGTH = 4;

/** 0 = não casa. Exato 4, começo da palavra 3, trecho 2, erro de digitação 1. */
function scoreToken(queryToken: string, fieldToken: string): number {
  if (fieldToken === queryToken) return 4;
  if (fieldToken.startsWith(queryToken)) return 3;
  if (queryToken.length >= 3 && fieldToken.includes(queryToken)) return 2;
  if (queryToken.length >= MIN_FUZZY_LENGTH) {
    if (isWithinOneEdit(queryToken, fieldToken)) return 1;
    // "leiet" também deve casar com o começo de "leites": compara com o prefixo do mesmo tamanho.
    if (isWithinOneEdit(queryToken, fieldToken.slice(0, queryToken.length))) return 1;
  }
  return 0;
}

/**
 * Pontuação de relevância do item para a consulta. `fields` em ordem de importância: o primeiro
 * (ex.: nome do produto) pesa mais. Retorna 0 quando alguma palavra digitada não casa com nada.
 */
export function scoreMatch(
  query: string,
  fields: ReadonlyArray<string | null | undefined>,
): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 1;
  const fieldTokens = fields.map((field) => tokenize(field ?? ""));

  let total = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    fieldTokens.forEach((tokens, fieldIndex) => {
      const fieldWeight = fieldIndex === 0 ? 2 : 1;
      for (const token of tokens) {
        best = Math.max(best, scoreToken(queryToken, token) * fieldWeight);
      }
    });
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** Filtra e, havendo consulta, ordena do mais para o menos relevante (estável nos empates). */
export function searchItems<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => ReadonlyArray<string | null | undefined>,
): T[] {
  if (tokenize(query).length === 0) return [...items];
  return items
    .map((item, index) => ({ item, index, score: scoreMatch(query, getFields(item)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
