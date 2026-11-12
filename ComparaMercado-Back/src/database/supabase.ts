import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;

/**
 * Teto para cada chamada ao Supabase feita pela API. Fica abaixo do tempo que o front espera pela
 * API (10 s): se o Supabase travar, a API responde `502 data_unavailable` rápido, em vez de
 * pendurar a requisição até o front desistir com um erro genérico de tempo esgotado.
 */
export const API_DB_TIMEOUT_MS = 8_000;

/** Workers fazem lotes maiores (upserts do pipeline de ingestão) e toleram mais espera. */
export const WORKER_DB_TIMEOUT_MS = 30_000;

export interface ClientOptions {
  /** Tempo máximo de cada chamada HTTP ao Supabase. */
  timeoutMs?: number;
}

/**
 * `fetch` com prazo: sem isto o supabase-js espera para sempre por um gateway que aceita a conexão
 * mas não responde (ex.: containers do Supabase local travados).
 */
export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return fetch(input, { ...init, signal });
  };
}

/**
 * Sem retry automático do PostgREST: ele repetiria a leitura 3x com backoff (1 s, 2 s, 4 s) quando o
 * `fetch` rejeita, somando ~4x o prazo acima e estourando o orçamento de tempo do front. Falhar uma
 * vez e rápido é o comportamento previsível; quem consome decide se tenta de novo.
 */
const NO_RETRY = { retry: false } as const;

/**
 * Cliente com a chave anon (pública). Respeita a RLS. Pode ser usado no servidor ou navegador.
 */
export function createAnonClient(url: string, anonKey: string, options: ClientOptions = {}): Db {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: NO_RETRY,
    global: { fetch: fetchWithTimeout(options.timeoutMs ?? API_DB_TIMEOUT_MS) },
  });
}

/**
 * Cliente que age como o usuário dono do token (JWT do Supabase Auth): a RLS é avaliada com a
 * identidade dele. É assim que a API executa operações de administrador, sem `service_role`.
 */
export function createUserClient(
  url: string,
  anonKey: string,
  accessToken: string,
  options: ClientOptions = {},
): Db {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: NO_RETRY,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: fetchWithTimeout(options.timeoutMs ?? API_DB_TIMEOUT_MS),
    },
  });
}

/**
 * Cliente com `service_role`: IGNORA a RLS. Só para workers e código de servidor confiável.
 * Nunca importe isto em código que roda no navegador nem exponha a chave via NEXT_PUBLIC_*.
 */
export function createServiceClient(
  url: string,
  serviceRoleKey: string,
  options: ClientOptions = {},
): Db {
  if ("window" in globalThis) {
    throw new Error("createServiceClient não pode ser usado no navegador");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: NO_RETRY,
    global: { fetch: fetchWithTimeout(options.timeoutMs ?? WORKER_DB_TIMEOUT_MS) },
  });
}
