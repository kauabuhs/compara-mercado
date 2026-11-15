import {
  AdminCategoryListSchema,
  AdminCategorySchema,
  AdminCityListSchema,
  AdminCitySchema,
  AdminOverviewSchema,
  AdminProductListSchema,
  AdminProductSchema,
  AdminStoreListSchema,
  AdminStoreSchema,
  apiRoutes,
  CitiesResponseSchema,
  CityDetailSchema,
  CitySearchResponseSchema,
  CommunityFeedResponseSchema,
  type CompareListRequest,
  type ConfirmationVerdict,
  ConfirmObservationResponseSchema,
  ContributionCreatedSchema,
  type CreateCategoryRequest,
  type CreateCityRequest,
  type CreateProductRequest,
  type CreateStoreRequest,
  ListComparisonSchema,
  type ManualPriceRequest,
  type ModerationDecisionRequest,
  ModerationResponseSchema,
  MyContributionsResponseSchema,
  OffersResponseSchema,
  type OffersSort,
  PriceFormOptionsSchema,
  ProductDetailsSchema,
  ProfileSchema,
  type ReportReason,
  ReputationSchema,
  type ReviewDecision,
  ReviewQueueResponseSchema,
  SearchProductsResponseSchema,
  SessionUserSchema,
  StoresResponseSchema,
  type SyncListRequest,
  SyncListResponseSchema,
  type UpdateCategoryRequest,
  type UpdateCityRequest,
  type UpdateProductRequest,
  type UpdateProfileRequest,
  type UpdateStoreRequest,
} from "@contracts";
import { cache } from "react";
import { z } from "zod";
import { ApiRequestError, apiFetchBinary, apiRequest, CATALOG_CACHE_TAG } from "./client";

const OkResponseSchema = z.object({ ok: z.literal(true) });

// Segundos de cache no Next para cada leitura pública. Soma-se ao cache da própria API, então um
// dado pode chegar à tela com até (API + Next) de atraso; `updateTag(CATALOG_CACHE_TAG)` zera o
// lado do Next logo depois de uma escrita do admin.
const PRODUCT_REVALIDATE_SECONDS = 60;
const OFFERS_REVALIDATE_SECONDS = 60;
const STORES_REVALIDATE_SECONDS = 300;
const CITY_REVALIDATE_SECONDS = 60;

const catalogCache = (revalidate: number) => ({ revalidate, tags: [CATALOG_CACHE_TAG] });

// ── Públicos ───────────────────────────────────────────────────────────────────────────────────

/** Uma página da busca de produtos, com o `total` de resultados para a paginação. */
export function searchProducts(
  term: string,
  options: { page?: number; pageSize?: number; onlyPriced?: boolean } = {},
) {
  return apiRequest(apiRoutes.searchProducts, {
    schema: SearchProductsResponseSchema,
    query: {
      q: term,
      page: options.page,
      pageSize: options.pageSize,
      onlyPriced: options.onlyPriced ? "1" : undefined,
    },
  });
}

/**
 * `null` quando o produto não existe ou o id é inválido. `cache()` do React deduplica dentro da
 * mesma renderização: `generateMetadata` e a página chamam isto e só uma ida acontece (o `fetch`
 * com `signal` não é deduplicado pelo Next).
 */
export const getProductDetails = cache(async (productId: string) => {
  try {
    return await apiRequest(apiRoutes.productDetails(encodeURIComponent(productId)), {
      schema: ProductDetailsSchema,
      cache: catalogCache(PRODUCT_REVALIDATE_SECONDS),
    });
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
});

export interface ListOffersOptions {
  page?: number;
  pageSize?: number;
  storeId?: string;
  q?: string;
  sort?: OffersSort;
  expiringSoon?: boolean;
}

/** Uma página de ofertas; busca, filtro e ordenação são feitos no servidor (a API pagina). */
export function listOffers(options: ListOffersOptions = {}) {
  return apiRequest(apiRoutes.offers, {
    schema: OffersResponseSchema,
    query: {
      page: options.page,
      pageSize: options.pageSize,
      storeId: options.storeId,
      q: options.q,
      sort: options.sort,
      expiring: options.expiringSoon ? "1" : undefined,
    },
    cache: catalogCache(OFFERS_REVALIDATE_SECONDS),
  });
}

/** Mercados ativos; com `cityId`, só os dessa cidade (a API valida o filtro). */
export async function listStores(options: { cityId?: string } = {}) {
  const { stores } = await apiRequest(apiRoutes.stores, {
    schema: StoresResponseSchema,
    query: { cityId: options.cityId },
    cache: catalogCache(STORES_REVALIDATE_SECONDS),
  });
  return stores;
}

/** Cidades habilitadas no comparador (para escolher a cidade preferida). */
export async function listCities() {
  const { cities } = await apiRequest(apiRoutes.cities, {
    schema: CitiesResponseSchema,
    cache: catalogCache(STORES_REVALIDATE_SECONDS),
  });
  return cities;
}

/**
 * Busca na biblioteca de cidades (todos os municípios do IBGE). Sem `q`, devolve as cidades que
 * já têm mercados. Sem cache do Next: roda a cada pausa de digitação e a API já guarda o seu.
 */
export async function searchCities(
  query: { q?: string; uf?: string; limit?: number },
  clientIp: string,
) {
  const { cities } = await apiRequest(apiRoutes.citySearch, {
    schema: CitySearchResponseSchema,
    query,
    clientIp,
  });
  return cities;
}

/** Uma cidade da biblioteca (com cobertura); `null` quando não existe. */
export async function getCity(cityId: string) {
  try {
    return await apiRequest(apiRoutes.city(cityId), {
      schema: CityDetailSchema,
      cache: catalogCache(CITY_REVALIDATE_SECONDS),
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

export function compareList(request: CompareListRequest, clientIp: string) {
  return apiRequest(apiRoutes.compareList, {
    schema: ListComparisonSchema,
    method: "POST",
    body: request,
    clientIp,
  });
}

// ── Com sessão ─────────────────────────────────────────────────────────────────────────────────

/** `null` quando o token é inválido ou expirou. */
export async function getCurrentUser(accessToken: string) {
  try {
    return await apiRequest(apiRoutes.currentUser, { schema: SessionUserSchema, accessToken });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

// ── Perfil da conta (usuário logado) ───────────────────────────────────────────────────────────

export function getMyProfile(accessToken: string) {
  return apiRequest(apiRoutes.myProfile, { schema: ProfileSchema, accessToken });
}

/** Edição parcial: só os campos enviados mudam; `null` apaga o dado. */
export function updateMyProfile(accessToken: string, changes: UpdateProfileRequest) {
  return apiRequest(apiRoutes.myProfile, {
    schema: ProfileSchema,
    method: "PATCH",
    body: changes,
    accessToken,
  });
}

// ── Contribuição de preços (usuário logado) ────────────────────────────────────────────────────

/** Envia preço + foto (multipart). A API valida e sanitiza a foto; o envio nasce pendente. */
export function submitContribution(accessToken: string, formData: FormData) {
  return apiRequest(apiRoutes.contributions, {
    schema: ContributionCreatedSchema,
    method: "POST",
    formData,
    accessToken,
  });
}

/** Envios do próprio usuário (a API só devolve os dele), do mais recente ao mais antigo. */
export function getMyContributions(accessToken: string, options: { page?: number } = {}) {
  return apiRequest(apiRoutes.myContributions, {
    schema: MyContributionsResponseSchema,
    query: { page: options.page },
    accessToken,
  });
}

// ── Comunidade (ADR-0010) ──────────────────────────────────────────────────────────────────────

export interface CommunityFeedOptions {
  cityId: string;
  /** Com sessão, o feed marca "é meu" e o voto do usuário (e nunca é compartilhado em cache). */
  accessToken?: string;
  /** Posição do aparelho (opcional): distância e filtro por raio. Nunca é gravada. */
  where?: { lat: number; lng: number; radiusM?: number };
  promoOnly?: boolean;
  cursor?: string;
  limit?: number;
}

/** Uma página do feed da cidade; leitura pública, a sessão só personaliza. */
export function getCommunityFeed(options: CommunityFeedOptions) {
  return apiRequest(apiRoutes.communityFeed, {
    schema: CommunityFeedResponseSchema,
    query: {
      cityId: options.cityId,
      lat: options.where?.lat,
      lng: options.where?.lng,
      radiusM: options.where?.radiusM,
      promo: options.promoOnly ? "1" : undefined,
      cursor: options.cursor,
      limit: options.limit,
    },
    ...(options.accessToken ? { accessToken: options.accessToken } : {}),
  });
}

export function confirmObservation(
  accessToken: string,
  observationId: string,
  verdict: ConfirmationVerdict,
) {
  return apiRequest(apiRoutes.communityConfirm(observationId), {
    schema: ConfirmObservationResponseSchema,
    method: "POST",
    body: { verdict },
    accessToken,
  });
}

export async function reportObservation(
  accessToken: string,
  observationId: string,
  reason: ReportReason,
) {
  await apiRequest(apiRoutes.communityReport(observationId), {
    schema: OkResponseSchema,
    method: "POST",
    body: { reason },
    accessToken,
  });
}

/** Reputação e últimos pontos do próprio usuário. */
export function getMyReputation(accessToken: string) {
  return apiRequest(apiRoutes.myReputation, { schema: ReputationSchema, accessToken });
}

/** Resposta crua com os bytes da foto de uma publicação do feed (só logado); status do chamador. */
export function fetchCommunityPhoto(accessToken: string, observationId: string) {
  return apiFetchBinary(apiRoutes.communityPhoto(observationId), accessToken);
}

// ── Administração ──────────────────────────────────────────────────────────────────────────────

/** Resposta crua com os bytes da foto da etiqueta (só admin); o status é do chamador. */
export function fetchObservationPhoto(accessToken: string, observationId: string) {
  return apiFetchBinary(apiRoutes.adminObservationPhoto(observationId), accessToken);
}

export function getAdminOverview(accessToken: string) {
  return apiRequest(apiRoutes.adminOverview, { schema: AdminOverviewSchema, accessToken });
}

export function getPriceFormOptions(accessToken: string) {
  return apiRequest(apiRoutes.adminPriceFormOptions, {
    schema: PriceFormOptionsSchema,
    accessToken,
  });
}

export function getReviewQueue(accessToken: string, options: { page?: number } = {}) {
  return apiRequest(apiRoutes.adminReviewQueue, {
    schema: ReviewQueueResponseSchema,
    query: { page: options.page },
    accessToken,
  });
}

export async function createManualPrice(accessToken: string, request: ManualPriceRequest) {
  await apiRequest(apiRoutes.adminCreatePrice, {
    schema: OkResponseSchema,
    method: "POST",
    body: request,
    accessToken,
  });
}

export async function reviewObservation(
  accessToken: string,
  observationId: string,
  decision: ReviewDecision,
  note?: string,
) {
  await apiRequest(apiRoutes.adminReviewObservation(observationId), {
    schema: OkResponseSchema,
    method: "POST",
    body: { decision, ...(note ? { note } : {}) },
    accessToken,
  });
}

export function getModerationQueue(accessToken: string, options: { page?: number } = {}) {
  return apiRequest(apiRoutes.adminModeration, {
    schema: ModerationResponseSchema,
    query: { page: options.page },
    accessToken,
  });
}

export async function resolveModerationTask(
  accessToken: string,
  taskId: string,
  decision: ModerationDecisionRequest,
) {
  await apiRequest(apiRoutes.adminModerationTask(taskId), {
    schema: OkResponseSchema,
    method: "POST",
    body: decision,
    accessToken,
  });
}

// ── Cadastro-base (admin): cidades, mercados, categorias e produtos ────────────────────────────

export interface AdminListOptions {
  q?: string | undefined;
  situation?: "active" | "inactive" | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

function adminListQuery(options: AdminListOptions) {
  return {
    q: options.q || undefined,
    situation: options.situation,
    page: options.page,
    pageSize: options.pageSize,
  };
}

export function listAdminCities(accessToken: string, options: AdminListOptions = {}) {
  return apiRequest(apiRoutes.adminCities, {
    schema: AdminCityListSchema,
    query: adminListQuery(options),
    accessToken,
  });
}
export function createAdminCity(accessToken: string, body: CreateCityRequest) {
  return apiRequest(apiRoutes.adminCities, {
    schema: AdminCitySchema,
    method: "POST",
    body,
    accessToken,
  });
}
export function updateAdminCity(accessToken: string, cityId: string, body: UpdateCityRequest) {
  return apiRequest(apiRoutes.adminCity(cityId), {
    schema: AdminCitySchema,
    method: "PATCH",
    body,
    accessToken,
  });
}

export function listAdminStores(accessToken: string, options: AdminListOptions = {}) {
  return apiRequest(apiRoutes.adminStores, {
    schema: AdminStoreListSchema,
    query: adminListQuery(options),
    accessToken,
  });
}
export function createAdminStore(accessToken: string, body: CreateStoreRequest) {
  return apiRequest(apiRoutes.adminStores, {
    schema: AdminStoreSchema,
    method: "POST",
    body,
    accessToken,
  });
}
export function updateAdminStore(accessToken: string, storeId: string, body: UpdateStoreRequest) {
  return apiRequest(apiRoutes.adminStore(storeId), {
    schema: AdminStoreSchema,
    method: "PATCH",
    body,
    accessToken,
  });
}

export function listAdminCategories(accessToken: string, options: AdminListOptions = {}) {
  return apiRequest(apiRoutes.adminCategories, {
    schema: AdminCategoryListSchema,
    query: adminListQuery(options),
    accessToken,
  });
}
export function createAdminCategory(accessToken: string, body: CreateCategoryRequest) {
  return apiRequest(apiRoutes.adminCategories, {
    schema: AdminCategorySchema,
    method: "POST",
    body,
    accessToken,
  });
}
export function updateAdminCategory(
  accessToken: string,
  categoryId: string,
  body: UpdateCategoryRequest,
) {
  return apiRequest(apiRoutes.adminCategory(categoryId), {
    schema: AdminCategorySchema,
    method: "PATCH",
    body,
    accessToken,
  });
}

export function listAdminProducts(accessToken: string, options: AdminListOptions = {}) {
  return apiRequest(apiRoutes.adminProducts, {
    schema: AdminProductListSchema,
    query: adminListQuery(options),
    accessToken,
  });
}
export function createAdminProduct(accessToken: string, body: CreateProductRequest) {
  return apiRequest(apiRoutes.adminProducts, {
    schema: AdminProductSchema,
    method: "POST",
    body,
    accessToken,
  });
}
export function updateAdminProduct(
  accessToken: string,
  productId: string,
  body: UpdateProductRequest,
) {
  return apiRequest(apiRoutes.adminProduct(productId), {
    schema: AdminProductSchema,
    method: "PATCH",
    body,
    accessToken,
  });
}

// ── Lista de compras na conta ──────────────────────────────────────────────────────────────────

/** Reconcilia a lista do aparelho com a da conta; devolve a lista que passa a valer. */
export function syncMyList(accessToken: string, request: SyncListRequest) {
  return apiRequest(apiRoutes.syncMyList, {
    schema: SyncListResponseSchema,
    method: "POST",
    body: request,
    accessToken,
  });
}
