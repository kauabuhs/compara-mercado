import {
  AdminOverviewSchema,
  apiRoutes,
  type CompareListRequest,
  ContributionCreatedSchema,
  ListComparisonSchema,
  type ManualPriceRequest,
  MyContributionsResponseSchema,
  OffersResponseSchema,
  type OffersSort,
  PriceFormOptionsSchema,
  ProductDetailsSchema,
  type ReviewDecision,
  ReviewQueueResponseSchema,
  SearchProductsResponseSchema,
  SessionUserSchema,
  StoresResponseSchema,
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

export async function listStores() {
  const { stores } = await apiRequest(apiRoutes.stores, {
    schema: StoresResponseSchema,
    cache: catalogCache(STORES_REVALIDATE_SECONDS),
  });
  return stores;
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
) {
  await apiRequest(apiRoutes.adminReviewObservation(observationId), {
    schema: OkResponseSchema,
    method: "POST",
    body: { decision },
    accessToken,
  });
}
