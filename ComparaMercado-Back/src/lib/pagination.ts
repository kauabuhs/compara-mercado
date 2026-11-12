/**
 * Paginação numerada: regra pura, sem banco nem HTTP.
 * `page` começa em 1; o banco recebe `limit` + `offset`.
 */

/** Uma página de resultados e o total (já com os filtros aplicados) para montar a paginação. */
export interface Paged<T> {
  items: T[];
  total: number;
}

/** Deslocamento (offset) das linhas da página `page` (1-based). */
export function pageOffset(page: number, pageSize: number): number {
  return (Math.max(1, Math.trunc(page)) - 1) * pageSize;
}
