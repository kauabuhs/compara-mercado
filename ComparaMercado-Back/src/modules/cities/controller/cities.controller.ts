import { Hono } from "hono";
import { apiRoutes, CitySearchQuerySchema } from "../../../contracts";
import { type AppEnv, parseQuery, parseUuidParam } from "../../../middlewares/context";
import { errors } from "../../../middlewares/errors";
import { type RateLimiter, rateLimitByIp } from "../../../middlewares/rate-limit";
import { responseCache } from "../../../middlewares/response-cache";
import type { CitiesService } from "../cities.types";

export interface CitiesRoutesDeps {
  cities: CitiesService;
  /** A busca roda a cada tecla no seletor: limite por IP para não virar caminho de varredura. */
  searchRateLimiter: RateLimiter;
}

// A biblioteca é dado de referência (muda por migração); a cobertura muda quando entra um mercado.
const SEARCH_CACHE_SECONDS = 60;
const CITY_CACHE_SECONDS = 60;

/** Biblioteca de cidades: leituras públicas (sem login). */
export function citiesRoutes({ cities, searchRateLimiter }: CitiesRoutesDeps) {
  const routes = new Hono<AppEnv>();

  // Registrada antes de `/v1/cities/:cityId`, senão "search" seria lido como identificador.
  routes.get(
    apiRoutes.citySearch,
    rateLimitByIp(searchRateLimiter),
    responseCache({ ttlSeconds: SEARCH_CACHE_SECONDS }),
    async (c) => {
      const query = parseQuery(c, CitySearchQuerySchema);
      return c.json({ cities: await cities.search(query) });
    },
  );

  routes.get(
    apiRoutes.city(":cityId"),
    responseCache({ ttlSeconds: CITY_CACHE_SECONDS }),
    async (c) => {
      const city = await cities.get(parseUuidParam(c, "cityId"));
      if (!city) throw errors.notFound("Cidade não encontrada.");
      return c.json(city);
    },
  );

  return routes;
}
