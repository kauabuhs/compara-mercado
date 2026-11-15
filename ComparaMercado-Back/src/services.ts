import { createAnonClient, createUserClient } from "./database/supabase";
import type { AdminServiceFactory } from "./modules/admin/admin.types";
import { createAdminService } from "./modules/admin/service/admin.service";
import type { Authenticator } from "./modules/auth/auth.types";
import { createAuthenticator } from "./modules/auth/service/auth.service";
import { withAuthCache } from "./modules/auth/service/cached-authenticator";
import type { CatalogService } from "./modules/catalog/catalog.types";
import { createCatalogService } from "./modules/catalog/service/catalog.service";
import type { CitiesService } from "./modules/cities/cities.types";
import { createCitiesRepository } from "./modules/cities/repository/cities.repository";
import { createCitiesService } from "./modules/cities/service/cities.service";
import type { CommunityServiceFactory } from "./modules/community/community.types";
import { createCommunityRepository } from "./modules/community/repository/community.repository";
import { createCommunityService } from "./modules/community/service/community.service";
import type { ContributionServiceFactory } from "./modules/contributions/contributions.types";
import { createContributionRepository } from "./modules/contributions/repository/contributions.repository";
import { createContributionService } from "./modules/contributions/service/contributions.service";
import type { MyListServiceFactory } from "./modules/my-list/my-list.types";
import { createMyListRepository } from "./modules/my-list/repository/my-list.repository";
import { createMyListService } from "./modules/my-list/service/my-list.service";
import type { ProfileServiceFactory } from "./modules/profile/profile.types";
import { createProfileRepository } from "./modules/profile/repository/profile.repository";
import { createProfileService } from "./modules/profile/service/profile.service";
import type { RegistryServiceFactory } from "./modules/registry/registry.types";
import { createRegistryRepository } from "./modules/registry/repository/registry.repository";
import { createRegistryService } from "./modules/registry/service/registry.service";

/**
 * Raiz de composição da API: reúne os serviços de cada módulo. As rotas recebem só a porta de
 * que precisam; os testes montam um `Services` em memória e não passam por aqui.
 */
export interface Services {
  catalog: CatalogService;
  cities: CitiesService;
  authenticator: Authenticator;
  adminFor: AdminServiceFactory;
  registryFor: RegistryServiceFactory;
  myListFor: MyListServiceFactory;
  contributionsFor: ContributionServiceFactory;
  communityFor: CommunityServiceFactory;
  profileFor: ProfileServiceFactory;
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
    cities: createCitiesService(createCitiesRepository(publicDb)),
    authenticator: withAuthCache(createAuthenticator(config, publicDb)),
    adminFor: (accessToken) =>
      createAdminService(createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken)),
    myListFor: (accessToken) =>
      createMyListService(
        createMyListRepository(
          createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken),
        ),
      ),
    registryFor: (accessToken) =>
      createRegistryService(
        createRegistryRepository(
          createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken),
        ),
      ),
    contributionsFor: (accessToken) =>
      createContributionService(
        createContributionRepository(
          createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken),
        ),
        { now },
      ),
    // Visitante sem login (`null`) usa o cliente anônimo: só o feed funciona, e sem "é meu".
    communityFor: (accessToken) =>
      createCommunityService(
        createCommunityRepository(
          accessToken === null
            ? publicDb
            : createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken),
        ),
      ),
    profileFor: (accessToken) =>
      createProfileService(
        createProfileRepository(
          createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken),
        ),
      ),
  };
}
