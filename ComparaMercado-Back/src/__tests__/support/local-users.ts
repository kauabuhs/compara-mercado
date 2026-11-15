import { createClient } from "@supabase/supabase-js";

/**
 * Usuários descartáveis para os testes de integração contra o Supabase LOCAL.
 *
 * O cadastro real exige confirmar o e-mail (`enable_confirmations = true`), então `auth.signUp`
 * não devolve sessão. Aqui o usuário nasce já confirmado pela API admin (chave `service_role`
 * do Supabase local, só em teste) e entra com a senha. Nunca aponte isto para staging/produção.
 */
export interface LocalUsersConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/**
 * Lê do ambiente o que os testes precisam para criar usuários: `SUPABASE_TEST_URL`,
 * `SUPABASE_TEST_ANON_KEY` e a chave admin do Supabase local. `null` se faltar algo (o teste é
 * ignorado). Fica aqui porque este é o único lugar de testes que pode citar a chave admin.
 */
export function localUsersConfigFromEnv(): LocalUsersConfig | null {
  const url = process.env["SUPABASE_TEST_URL"];
  const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
  const serviceRoleKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
  return url && anonKey && serviceRoleKey ? { url, anonKey, serviceRoleKey } : null;
}

/**
 * Cliente com a chave administrativa do Supabase LOCAL, para preparar dados de teste que nenhum
 * usuário comum pode criar (um produto descartável, a reputação de um usuário). Fica aqui, e não
 * nos testes, porque este é o único lugar de testes autorizado a citar essa chave (`arch:check`).
 */
export function createLocalAdminClient(config: LocalUsersConfig) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface LocalUser {
  id: string;
  email: string;
  accessToken: string;
}

export async function createConfirmedUser(
  config: LocalUsersConfig,
  label: string,
  metadata: Record<string, unknown> = {},
): Promise<LocalUser> {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `${label}-${unique}@test.local`;
  // Atende a política local: 10+ caracteres com maiúscula, minúscula e número.
  const password = `Senha-${unique}-Forte!`;

  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser falhou: ${created.error?.message}`);
  }

  const client = createClient(config.url, config.anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session)
    throw new Error(`login do usuário de teste falhou: ${error?.message}`);
  return { id: created.data.user.id, email, accessToken: data.session.access_token };
}
