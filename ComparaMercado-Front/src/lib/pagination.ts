/** Paginação numerada: regra pura (sem React nem rede), usada pelas listagens do app. */

/** Nome do parâmetro de página na URL: `?pagina=3`. */
export const PAGE_PARAM = "pagina";

/** Tamanho de página das listagens (a API aceita até 50). */
export const LIST_PAGE_SIZE = 20;

const MAX_PAGE = 10_000;
const MAX_PAGES_SHOWN_IN_FULL = 7;

/** Lê `?pagina=` de forma segura: qualquer coisa que não seja inteiro ≥ 1 vira a página 1. */
export function parsePage(raw: string | readonly string[] | null | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

/** Quantas páginas existem para `total` itens (sempre ao menos 1, mesmo vazio). */
export function totalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Mantém a página dentro de [1, última]. */
export function clampPage(page: number, pages: number): number {
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, pages));
}

/** Itens mostrados na página (1-based, inclusivo): "21–40 de 1.284". */
export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(page * pageSize, total) };
}

export type PageToken = number | "ellipsis";

/**
 * Janela de números de página: sempre a primeira, a última e a atual com `siblings` vizinhas de
 * cada lado; lacunas viram reticências. Uma lacuna de uma única página mostra a própria página
 * (reticências no lugar de um só número seriam mais largas e menos úteis).
 *
 *   pageWindow(1, 5)   → [1, 2, 3, 4, 5]
 *   pageWindow(6, 40)  → [1, "ellipsis", 5, 6, 7, "ellipsis", 40]
 */
export function pageWindow(page: number, pages: number, siblings = 1): PageToken[] {
  if (pages <= 1) return [1];
  // Poucas páginas: esconder 1–2 delas atrás de reticências só atrapalha.
  if (pages <= MAX_PAGES_SHOWN_IN_FULL) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }
  const current = clampPage(page, pages);
  const wanted = new Set<number>([1, pages]);
  for (let offset = -siblings; offset <= siblings; offset += 1) {
    const candidate = current + offset;
    if (candidate >= 1 && candidate <= pages) wanted.add(candidate);
  }
  const sorted = [...wanted].sort((a, b) => a - b);

  const tokens: PageToken[] = [];
  let previous = 0;
  for (const value of sorted) {
    const gap = value - previous;
    if (previous !== 0 && gap === 2) tokens.push(previous + 1);
    else if (previous !== 0 && gap > 2) tokens.push("ellipsis");
    tokens.push(value);
    previous = value;
  }
  return tokens;
}
