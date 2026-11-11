import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;

/**
 * Cliente com a chave anon (pública). Respeita a RLS. Pode ser usado no servidor ou navegador.
 */
export function createAnonClient(url: string, anonKey: string): Db {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente que age como o usuário dono do token (JWT do Supabase Auth): a RLS é avaliada com a
 * identidade dele. É assim que a API executa operações de administrador, sem `service_role`.
 */
export function createUserClient(url: string, anonKey: string, accessToken: string): Db {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Cliente com `service_role`: IGNORA a RLS. Só para workers e código de servidor confiável.
 * Nunca importe isto em código que roda no navegador nem exponha a chave via NEXT_PUBLIC_*.
 */
export function createServiceClient(url: string, serviceRoleKey: string): Db {
  if ("window" in globalThis) {
    throw new Error("createServiceClient não pode ser usado no navegador");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
