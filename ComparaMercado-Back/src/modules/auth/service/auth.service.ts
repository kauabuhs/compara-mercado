import { createUserClient, type Db } from "../../../database/supabase";
import type { Authenticator } from "../auth.types";

export interface AuthServiceConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function createAuthenticator(config: AuthServiceConfig, publicDb: Db): Authenticator {
  return {
    async authenticate(accessToken) {
      // Valida o token no servidor do Supabase (não confia no conteúdo do JWT).
      const { data, error } = await publicDb.auth.getUser(accessToken);
      if (error || !data.user) return null;

      // O papel vem da tabela `profiles`, lida com a identidade do usuário (RLS).
      const userDb = createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken);
      const { data: profile } = await userDb
        .from("profiles")
        .select("role, display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        role: profile?.role ?? "user",
        displayName: profile?.display_name ?? null,
      };
    },
  };
}
