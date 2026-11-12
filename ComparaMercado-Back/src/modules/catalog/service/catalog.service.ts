import type { Db } from "../../../database/supabase";
import { pageOffset } from "../../../lib/pagination";
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
    searchProducts: (query) =>
      searchProducts(publicDb, query.q, {
        limit: query.pageSize,
        offset: pageOffset(query.page, query.pageSize),
        onlyPriced: query.onlyPriced,
      }),

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
      const { items, total } = await listOffers(publicDb, {
        limit: query.pageSize,
        offset: pageOffset(query.page, query.pageSize),
        sort: query.sort,
        expiringSoon: query.expiring,
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.q ? { query: query.q } : {}),
      });
      const currentTime = now();
      return { items: items.map((offer) => withFreshness(offer, currentTime)), total };
    },

    listStores: (query) => listStores(publicDb, query.cityId),

    compareList: (request) => compareList(publicDb, request.items, request.where),
  };
}
