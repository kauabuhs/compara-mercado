import { Hono } from "hono";
import {
  apiRoutes,
  CompareListRequestSchema,
  OffersQuerySchema,
  SearchProductsQuerySchema,
  StoresQuerySchema,
} from "../../../contracts";
import {
  type AppEnv,
  parseJsonBody,
  parseQuery,
  parseUuidParam,
} from "../../../middlewares/context";
import { errors } from "../../../middlewares/errors";
import { type RateLimiter, rateLimitByIp } from "../../../middlewares/rate-limit";
import { responseCache } from "../../../middlewares/response-cache";
import type { CatalogService } from "../catalog.types";

export interface CatalogRoutesDeps {
  catalog: CatalogService;
  compareRateLimiter: RateLimiter;
}

// Leituras públicas mudam pouco: 60 s de cache em memória (mercados, 5 min). Protege o Supabase
// de picos e substitui o ISR que o front tinha quando lia o banco direto.
const PUBLIC_READ_CACHE_SECONDS = 60;
const STORES_CACHE_SECONDS = 300;

/** Leituras públicas e a comparação de lista: não exigem login. */
export function catalogRoutes({ catalog, compareRateLimiter }: CatalogRoutesDeps) {
  const routes = new Hono<AppEnv>();
  const publicReadCache = () => responseCache({ ttlSeconds: PUBLIC_READ_CACHE_SECONDS });

  routes.get(apiRoutes.searchProducts, publicReadCache(), async (c) => {
    const query = parseQuery(c, SearchProductsQuerySchema);
    return c.json({ hits: await catalog.searchProducts(query) });
  });

  routes.get(apiRoutes.productDetails(":productId"), publicReadCache(), async (c) => {
    const productId = parseUuidParam(c, "productId");
    const details = await catalog.getProductDetails(productId);
    if (!details) throw errors.notFound("Produto não encontrado.");
    return c.json(details);
  });

  routes.get(apiRoutes.offers, publicReadCache(), async (c) => {
    const query = parseQuery(c, OffersQuerySchema);
    return c.json({ offers: await catalog.listOffers(query) });
  });

  routes.get(apiRoutes.stores, responseCache({ ttlSeconds: STORES_CACHE_SECONDS }), async (c) => {
    const query = parseQuery(c, StoresQuerySchema);
    return c.json({ stores: await catalog.listStores(query) });
  });

  routes.post(apiRoutes.compareList, rateLimitByIp(compareRateLimiter), async (c) => {
    const request = await parseJsonBody(c, CompareListRequestSchema);
    return c.json(await catalog.compareList(request));
  });

  return routes;
}
