import type { Db } from "../../../database/supabase";
import type { CatalogService } from "../catalog.types";
import {
  compareList,
  getPriceHistory,
  getProduct,
  getProductPrices,
  listOffers,
  listStores,
  searchProducts,
} from "../repository/catalog.repository";
import { withFreshness } from "./catalog.freshness";

const PRICE_HISTORY_DAYS = 90;

/** Leituras públicas sobre o Supabase, sempre com a chave anônima (a RLS decide o que é visível). */
export function createCatalogService(publicDb: Db, now: () => Date): CatalogService {
  return {
    searchProducts: (query) => searchProducts(publicDb, query.q, query.limit),

    async getProductDetails(productId) {
      // As três consultas são independentes: uma só espera de rede em vez de duas em sequência.
      // Para um id inexistente sobram duas consultas baratas (índice por produto) — o preço de
      // não pagar um round-trip extra no caso comum, que é o produto existir.
      const [product, prices, history] = await Promise.all([
        getProduct(publicDb, productId),
        getProductPrices(publicDb, productId),
        getPriceHistory(publicDb, productId, { days: PRICE_HISTORY_DAYS }),
      ]);
      if (!product) return null;
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
