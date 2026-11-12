import type { SessionUser } from "@contracts";
import { getCurrentUser } from "@/services/api/endpoints";
import { createAuthClient } from "./supabase/auth-client";

/**
 * Token de acesso da sessão (cookie httpOnly do Supabase Auth). Não é confiável por si só:
 * quem o valida é a API, a cada chamada.
 */
export async function getAccessToken(): Promise<string | null> {
  const authClient = await createAuthClient();
  const { data } = await authClient.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Usuário logado e papel, lidos da API. Serve para decidir o que mostrar na interface. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const accessToken = await getAccessToken();
  return accessToken ? getCurrentUser(accessToken) : null;
}
