/**
 * Monta a query string a partir da atual com alterações, para links de filtro e de página.
 * Valor `null`, `undefined` ou vazio REMOVE o parâmetro. Devolve com o "?" na frente, ou "" se
 * não sobrar nada (assim `${pathname}${withParams(...)}` nunca termina em "?").
 */
export function withParams(
  current: URLSearchParams | string,
  updates: Readonly<Record<string, string | number | null | undefined>>,
): string {
  const next = new URLSearchParams(typeof current === "string" ? current : current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}
