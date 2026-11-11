import type { MiddlewareHandler } from "hono";

interface CachedResponse {
  expiresAt: number;
  status: number;
  body: string;
  contentType: string;
}

export interface ResponseCacheOptions {
  ttlSeconds: number;
  /** Teto de entradas; ao passar dele, descarta as mais antigas. */
  maxEntries?: number;
  now?: () => number;
}

/**
 * Cache em memória das leituras públicas (GET). Só guarda respostas 200 e usa a URL completa
 * (com a query string) como chave; nada que dependa de usuário deve passar por aqui.
 * Limitação conhecida: o estado é por instância, como o limitador de taxa. O cabeçalho
 * `x-cache` (HIT/MISS) existe para diagnóstico e testes.
 */
export function responseCache(options: ResponseCacheOptions): MiddlewareHandler {
  const { ttlSeconds, maxEntries = 500, now = Date.now } = options;
  const entries = new Map<string, CachedResponse>();

  return async (c, next) => {
    if (c.req.method !== "GET") return next();

    const cacheKey = c.req.url;
    const currentTime = now();
    const cached = entries.get(cacheKey);
    if (cached && cached.expiresAt > currentTime) {
      c.header("x-cache", "HIT");
      return c.body(cached.body, cached.status as 200, { "content-type": cached.contentType });
    }

    await next();
    c.header("x-cache", "MISS");

    if (c.res.status === 200) {
      entries.delete(cacheKey);
      entries.set(cacheKey, {
        expiresAt: currentTime + ttlSeconds * 1000,
        status: c.res.status,
        body: await c.res.clone().text(),
        contentType: c.res.headers.get("content-type") ?? "application/json",
      });
      if (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) entries.delete(oldestKey);
      }
    }
    return undefined;
  };
}
