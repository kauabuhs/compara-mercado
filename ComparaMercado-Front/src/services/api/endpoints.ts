import {
  AdminOverviewSchema,
  apiRoutes,
  type CompareListRequest,
  ListComparisonSchema,
  type ManualPriceRequest,
  OffersResponseSchema,
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
import { ApiRequestError, apiRequest, CATALOG_CACHE_TAG } from "./client";

const OkResponseSchema = z.object({ ok: z.literal(true) });

// Segundos de cache no Next para cada leitura pública. Soma-se ao cache da própria API, então um
// dado pode chegar à tela com até (API + Next) de atraso; `updateTag(CATALOG_CACHE_TAG)` zera o
// lado do Next logo depois de uma escrita do admin.
const PRODUCT_REVALIDATE_SECONDS = 60;
const OFFERS_REVALIDATE_SECONDS = 60;
const STORES_REVALIDATE_SECONDS = 300;

const catalogCache = (revalidate: number) => ({ revalidate, tags: [CATALOG_CACHE_TAG] });

// ── Públicos ───────────────────────────────────────────────────────────────────────────────────

export async function searchProducts(term: string, limit: number) {
  const { hits } = await apiRequest(apiRoutes.searchProducts, {
    schema: SearchProductsResponseSchema,
    query: { q: term, limit },
  });
  return hits;
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

export async function listOffers(options: { limit?: number; storeId?: string } = {}) {
  const { offers } = await apiRequest(apiRoutes.offers, {
    schema: OffersResponseSchema,
    query: { limit: options.limit, storeId: options.storeId },
    cache: catalogCache(OFFERS_REVALIDATE_SECONDS),
  });
  return offers;
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

// ── Administração ──────────────────────────────────────────────────────────────────────────────

export function getAdminOverview(accessToken: string) {
  return apiRequest(apiRoutes.adminOverview, { schema: AdminOverviewSchema, accessToken });
}

export function getPriceFormOptions(accessToken: string) {
  return apiRequest(apiRoutes.adminPriceFormOptions, {
    schema: PriceFormOptionsSchema,
    accessToken,
  });
}

export async function getReviewQueue(accessToken: string) {
  const { observations } = await apiRequest(apiRoutes.adminReviewQueue, {
    schema: ReviewQueueResponseSchema,
    accessToken,
  });
  return observations;
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
