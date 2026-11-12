import { ApiErrorBodySchema } from "@contracts";
import type { ZodType } from "zod";
import { env } from "@/server/env";

const REQUEST_TIMEOUT_MS = 10_000;

/** A API respondeu com erro (4xx/5xx). `code` e `message` seguem o contrato `ApiErrorBody`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Não foi possível falar com a API (rede, tempo esgotado ou servidor fora do ar). */
export class ApiUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("A API do back-end está indisponível.", options);
    this.name = "ApiUnavailableError";
  }
}

export interface ApiRequestOptions<T> {
  /** Schema do contrato: a resposta é validada antes de chegar à interface. */
  schema: ZodType<T>;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Token do Supabase Auth do usuário logado (repassado no cabeçalho Authorization). */
  accessToken?: string;
  /** IP do cliente final, para o limite de taxa da API. */
  clientIp?: string;
  /**
   * Guarda a resposta no cache de dados do Next por `revalidate` segundos. Só vale para leituras
   * públicas: é ignorado quando há `accessToken`, para que dado de usuário nunca seja
   * compartilhado. As `tags` permitem invalidar na hora (`updateTag`) depois de uma escrita.
   */
  cache?: { revalidate: number; tags?: string[] };
}

/** Tag das leituras públicas do catálogo (preços, ofertas, mercados). */
export const CATALOG_CACHE_TAG = "catalog";

/**
 * Chamada tipada à API do back-end. Só roda no servidor do Next: o navegador nunca recebe a URL
 * da API nem o token (que fica em cookie httpOnly).
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions<T>): Promise<T> {
  const url = new URL(path, env().API_URL);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (options.accessToken) headers["authorization"] = `Bearer ${options.accessToken}`;
  if (options.clientIp) headers["x-forwarded-for"] = options.clientIp;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  // Cache do Next só para GET público declarado pelo chamador; todo o resto continua sem cache.
  const sharedCache =
    options.cache && !options.accessToken && (options.method ?? "GET") === "GET"
      ? options.cache
      : undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(sharedCache
        ? {
            next: {
              revalidate: sharedCache.revalidate,
              ...(sharedCache.tags ? { tags: sharedCache.tags } : {}),
            },
          }
        : { cache: "no-store" as const }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ApiUnavailableError({ cause });
  }

  if (!response.ok) {
    const errorBody = ApiErrorBodySchema.safeParse(await response.json().catch(() => null));
    throw new ApiRequestError(
      response.status,
      errorBody.success ? errorBody.data.error.code : "unknown_error",
      errorBody.success ? errorBody.data.error.message : `A API respondeu ${response.status}.`,
    );
  }

  return options.schema.parse(await response.json());
}
