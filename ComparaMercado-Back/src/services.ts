import { createAnonClient, createUserClient } from "./database/supabase";
import type { AdminServiceFactory } from "./modules/admin/admin.types";
import { createAdminService } from "./modules/admin/service/admin.service";
import type { Authenticator } from "./modules/auth/auth.types";
import { createAuthenticator } from "./modules/auth/service/auth.service";
import { withAuthCache } from "./modules/auth/service/cached-authenticator";
import type { CatalogService } from "./modules/catalog/catalog.types";
import { createCatalogService } from "./modules/catalog/service/catalog.service";

/**
 * Raiz de composição da API: reúne os serviços de cada módulo. As rotas recebem só a porta de
 * que precisam; os testes montam um `Services` em memória e não passam por aqui.
 */
export interface Services {
  catalog: CatalogService;
  authenticator: Authenticator;
  adminFor: AdminServiceFactory;
}

export interface SupabaseServicesConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  now?: () => Date;
}

/** Implementação das portas sobre o Supabase. Nunca usa `service_role`: tudo passa pela RLS. */
export function createSupabaseServices(config: SupabaseServicesConfig): Services {
  const publicDb = createAnonClient(config.supabaseUrl, config.supabaseAnonKey);
  const now = config.now ?? (() => new Date());
  return {
    catalog: createCatalogService(publicDb, now),
    authenticator: withAuthCache(createAuthenticator(config, publicDb)),
    adminFor: (accessToken) =>
      createAdminService(createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken)),
  };
}
