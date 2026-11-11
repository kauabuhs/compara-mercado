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
} from "@compara/contracts";
import { z } from "zod";
import { ApiRequestError, apiRequest } from "./client";

const OkResponseSchema = z.object({ ok: z.literal(true) });

// ── Públicos ───────────────────────────────────────────────────────────────────────────────────

export async function searchProducts(term: string, limit: number) {
  const { hits } = await apiRequest(apiRoutes.searchProducts, {
    schema: SearchProductsResponseSchema,
    query: { q: term, limit },
  });
  return hits;
}

/** `null` quando o produto não existe ou o id é inválido. */
export async function getProductDetails(productId: string) {
  try {
    return await apiRequest(apiRoutes.productDetails(encodeURIComponent(productId)), {
      schema: ProductDetailsSchema,
    });
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
}

export async function listOffers(options: { limit?: number; storeId?: string } = {}) {
  const { offers } = await apiRequest(apiRoutes.offers, {
    schema: OffersResponseSchema,
    query: { limit: options.limit, storeId: options.storeId },
  });
  return offers;
}

export async function listStores() {
  const { stores } = await apiRequest(apiRoutes.stores, {
    schema: StoresResponseSchema,
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
