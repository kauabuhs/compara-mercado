/**
 * Cursor de paginação do feed: regra pura. Aponta para a última linha entregue (`createdAt`, `id`)
 * e é opaco para o cliente. Paginar por cursor, e não por página numerada, mantém a lista estável
 * quando publicações novas chegam enquanto a pessoa rola.
 */

export interface FeedCursor {
  createdAt: string;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Base64 seguro para URL, sem depender de `Buffer` (arquivo de regra pura: sem APIs do Node). */
function toBase64Url(text: string): string {
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

/** Data ISO e UUID são ASCII: o JSON do cursor cabe em `btoa` sem passar por UTF-8. */
export function encodeFeedCursor(cursor: FeedCursor): string {
  return toBase64Url(JSON.stringify([cursor.createdAt, cursor.id]));
}

/** `null` para qualquer cursor malformado: o chamador responde 400, nunca confia no conteúdo. */
export function decodeFeedCursor(raw: string): FeedCursor | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed as unknown[];
    if (typeof createdAt !== "string" || typeof id !== "string") return null;
    if (Number.isNaN(Date.parse(createdAt)) || !UUID_PATTERN.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
