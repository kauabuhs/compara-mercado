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
 * Chave estável: caminho + query ordenada. `?a=1&b=2` e `?b=2&a=1` são a mesma leitura, então
 * dividem a mesma entrada em vez de duplicarem a ida ao banco.
 */
function buildCacheKey(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.sort();
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * Cache em memória das leituras públicas (GET). Só guarda respostas 200; nada que dependa de
 * usuário deve passar por aqui.
 *
 * - Requisições idênticas que chegam enquanto a primeira ainda consulta o banco esperam por ela
 *   (uma ida ao banco em vez de N quando a entrada expira sob carga).
 * - Se a primeira falhar, quem esperava tenta por conta própria; erro nunca é compartilhado.
 *
 * Limitação conhecida: o estado é por instância, como o limitador de taxa. O cabeçalho
 * `x-cache` (HIT/MISS) existe para diagnóstico e testes; HIT também cobre quem pegou carona
 * numa consulta em andamento.
 */
export function responseCache(options: ResponseCacheOptions): MiddlewareHandler {
  const { ttlSeconds, maxEntries = 500, now = Date.now } = options;
  const entries = new Map<string, CachedResponse>();
  const inFlight = new Map<string, Promise<CachedResponse | undefined>>();

  return async (c, next) => {
    if (c.req.method !== "GET") return next();

    const cacheKey = buildCacheKey(c.req.url);
    const respondFrom = (cached: CachedResponse) => {
      c.header("x-cache", "HIT");
      return c.body(cached.body, cached.status as 200, { "content-type": cached.contentType });
    };

    const cached = entries.get(cacheKey);
    if (cached && cached.expiresAt > now()) return respondFrom(cached);

    const ongoing = inFlight.get(cacheKey);
    if (ongoing) {
      const shared = await ongoing;
      if (shared) return respondFrom(shared);
    }

    let settle: (entry: CachedResponse | undefined) => void = () => {};
    inFlight.set(
      cacheKey,
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    let entry: CachedResponse | undefined;
    try {
      await next();
      c.header("x-cache", "MISS");
      if (c.res.status === 200) {
        entry = {
          expiresAt: now() + ttlSeconds * 1000,
          status: c.res.status,
          body: await c.res.clone().text(),
          contentType: c.res.headers.get("content-type") ?? "application/json",
        };
        entries.delete(cacheKey);
        entries.set(cacheKey, entry);
        if (entries.size > maxEntries) {
          const oldestKey = entries.keys().next().value;
          if (oldestKey !== undefined) entries.delete(oldestKey);
        }
      }
    } finally {
      inFlight.delete(cacheKey);
      settle(entry);
    }
    return undefined;
  };
}
