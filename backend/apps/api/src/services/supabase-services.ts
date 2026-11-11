import type { PendingObservation, SizeUnit } from "@compara/contracts";
import {
  compareList,
  createAnonClient,
  createUserClient,
  type Db,
  DbError,
  getPriceHistory,
  getProduct,
  getProductPrices,
  listOffers,
  listStores,
  searchProducts,
} from "@compara/db";
import { withFreshness } from "./freshness";
import type { AdminService, Authenticator, CatalogService, Services } from "./types";

const PRICE_HISTORY_DAYS = 90;
// Ofertas valem até o fim do dia, no horário de Brasília.
const END_OF_DAY_BRASILIA = "T23:59:59-03:00";

export interface SupabaseServicesConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  now?: () => Date;
}

function throwIfError(operation: string, error: { message: string; code?: string } | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

function createCatalogService(publicDb: Db, now: () => Date): CatalogService {
  return {
    searchProducts: (query) => searchProducts(publicDb, query.q, query.limit),

    async getProductDetails(productId) {
      const product = await getProduct(publicDb, productId);
      if (!product) return null;
      const [prices, history] = await Promise.all([
        getProductPrices(publicDb, productId),
        getPriceHistory(publicDb, productId, { days: PRICE_HISTORY_DAYS }),
      ]);
      const currentTime = now();
      return {
        product,
        prices: prices.map((price) => withFreshness(price, currentTime)),
        history,
      };
    },

    async listOffers(query) {
      const offers = await listOffers(publicDb, {
        limit: query.limit,
        ...(query.storeId ? { storeId: query.storeId } : {}),
      });
      const currentTime = now();
      return offers.map((offer) => withFreshness(offer, currentTime));
    },

    listStores: (query) => listStores(publicDb, query.cityId),

    compareList: (request) => compareList(publicDb, request.items, request.where),
  };
}

function createAuthenticator(config: SupabaseServicesConfig, publicDb: Db): Authenticator {
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

function createAdminService(userDb: Db): AdminService {
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
      const { error } = await userDb
        .from("price_observations")
        .update({ status: decision })
        .eq("id", observationId)
        .eq("status", "pending");
      throwIfError("reviewObservation", error);
      if (decision === "approved") await userDb.rpc("refresh_current_prices");
    },
  };
}

/** Implementação das portas sobre o Supabase. Nunca usa `service_role`: tudo passa pela RLS. */
export function createSupabaseServices(config: SupabaseServicesConfig): Services {
  const publicDb = createAnonClient(config.supabaseUrl, config.supabaseAnonKey);
  const now = config.now ?? (() => new Date());
  return {
    catalog: createCatalogService(publicDb, now),
    authenticator: createAuthenticator(config, publicDb),
    adminFor: (accessToken) =>
      createAdminService(createUserClient(config.supabaseUrl, config.supabaseAnonKey, accessToken)),
  };
}
