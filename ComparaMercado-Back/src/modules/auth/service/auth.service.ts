import { DbError } from "../../../database/errors";
import { createUserClient, type Db } from "../../../database/supabase";
import type { Authenticator } from "../auth.types";

export interface AuthServiceConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Cliente que age como o dono do token (a RLS enxerga o usuário). Injetável para testes. */
export type UserDbFactory = (accessToken: string) => Db;

/** Falha de infraestrutura (rede, tempo esgotado, 5xx), não um token recusado. */
function isTransientAuthFailure(error: { name?: string; status?: number | undefined }): boolean {
  return error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500;
}

export function createAuthenticator(
  config: AuthServiceConfig,
  publicDb: Db,
  userDbFor: UserDbFactory = (accessToken) =>
    createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken),
): Authenticator {
  return {
    async authenticate(accessToken) {
      // Valida o token no servidor do Supabase (não confia no conteúdo do JWT).
      const { data, error } = await publicDb.auth.getUser(accessToken);
      // Soluço do Supabase NÃO é "token inválido": virar 401 deslogaria o usuário por engano.
      if (error && isTransientAuthFailure(error)) {
        throw new DbError(`authenticate.getUser: ${error.message}`, undefined, { cause: error });
      }
      if (error || !data.user) return null;

      // O papel vem da tabela `profiles`, lida com a identidade do usuário (RLS).
      const { data: profile, error: profileError } = await userDbFor(accessToken)
        .from("profiles")
        .select("role, display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      // Falha na leitura NÃO pode virar "user": o papel errado ficaria em cache e um admin perderia
      // o painel por causa de um soluço do banco. Responder 502 deixa o cliente tentar de novo.
      if (profileError) {
        throw new DbError(`authenticate.profile: ${profileError.message}`, profileError.code, {
          cause: profileError,
        });
      }
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        role: profile?.role ?? "user",
        displayName: profile?.display_name ?? null,
      };
    },
  };
}
