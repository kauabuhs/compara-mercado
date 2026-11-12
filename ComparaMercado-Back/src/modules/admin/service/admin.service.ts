import type { PendingObservation, SizeUnit } from "../../../contracts";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import type { AdminService } from "../admin.types";

// Ofertas valem até o fim do dia, no horário de Brasília.
const END_OF_DAY_BRASILIA = "T23:59:59-03:00";

function throwIfError(operation: string, error: { message: string; code?: string } | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

export function createAdminService(userDb: Db): AdminService {
  return {
    async getOverview() {
      const [pendingReviews, activeStores, activeProducts, currentPrices] = await Promise.all([
        userDb
          .from("price_observations")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        userDb.from("stores").select("id", { count: "exact", head: true }).eq("status", "active"),
        userDb.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
        userDb.from("current_prices").select("store_id", { count: "exact", head: true }),
      ]);
      return {
        pendingReviews: pendingReviews.count ?? 0,
        activeStores: activeStores.count ?? 0,
        activeProducts: activeProducts.count ?? 0,
        currentPrices: currentPrices.count ?? 0,
      };
    },

    async getPriceFormOptions() {
      const [stores, products] = await Promise.all([
        userDb.from("stores").select("id,name").eq("status", "active").order("name"),
        userDb
          .from("products")
          .select("id,canonical_name,brand,size_value,size_unit")
          .eq("status", "active")
          .order("canonical_name"),
      ]);
      throwIfError("getPriceFormOptions.stores", stores.error);
      throwIfError("getPriceFormOptions.products", products.error);
      return {
        stores: (stores.data ?? []).map((store) => ({ id: store.id, name: store.name })),
        products: (products.data ?? []).map((product) => ({
          id: product.id,
          name: product.canonical_name,
          brand: product.brand,
          sizeValue: Number(product.size_value),
          sizeUnit: product.size_unit as SizeUnit,
        })),
      };
    },

    async getReviewQueue() {
      const { data, error } = await userDb
        .from("price_observations")
        .select(
          "id,price_cents,unit_price_cents,promo,source,confidence,observed_at,stores(name),products(canonical_name,brand)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50);
      throwIfError("getReviewQueue", error);
      return (data ?? []).map(
        (row): PendingObservation => ({
          id: row.id,
          productName: row.products?.canonical_name ?? null,
          storeName: row.stores?.name ?? null,
          source: row.source,
          confidence: row.confidence === null ? null : Number(row.confidence),
          priceCents: row.price_cents,
        }),
      );
    },

    async createManualPrice(request, adminUserId) {
      const { error } = await userDb.from("price_observations").insert({
        store_id: request.storeId,
        product_id: request.productId,
        price_cents: request.priceCents,
        unit_price_cents: 1, // recalculado pelo trigger a partir do tamanho do produto
        promo: request.promo,
        valid_to: request.validTo ? `${request.validTo}${END_OF_DAY_BRASILIA}` : null,
        source: "manual",
        status: "approved",
        created_by: adminUserId,
      });
      throwIfError("createManualPrice", error);
      await userDb.rpc("refresh_current_prices");
    },

    async reviewObservation(observationId, decision) {
      const { data: decided, error } = await userDb
        .from("price_observations")
        .update({ status: decision })
        .eq("id", observationId)
        .eq("status", "pending")
        .select("id");
      throwIfError("reviewObservation", error);
      if (!decided?.length) return false;
      if (decision === "approved") await userDb.rpc("refresh_current_prices");
      return true;
    },
  };
}
