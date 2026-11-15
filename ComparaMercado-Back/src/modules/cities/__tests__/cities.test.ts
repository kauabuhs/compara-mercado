import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { CitySearchQuerySchema } from "../../../contracts";
import type { AppEnv } from "../../../middlewares/context";
import { ApiError } from "../../../middlewares/errors";
import { RateLimiter } from "../../../middlewares/rate-limit";
import type { CitiesRepository, CitiesService, CityRecord } from "../cities.types";
import { citiesRoutes } from "../controller/cities.controller";
import { createCitiesService } from "../service/cities.service";

const CITY_ID = "5e8f4f1c-1b1a-4c8a-9b0e-7b1f0a9d3c01";

const covered: CityRecord = {
  id: CITY_ID,
  name: "Caxias do Sul",
  uf: "RS",
  ibgeCode: "4305108",
  storeCount: 6,
  centerLat: -29.1678,
  centerLng: -51.1794,
};
const uncovered: CityRecord = {
  ...covered,
  id: "6f9a5a2d-2c2b-4d9b-8c1f-8c2a1b0e4d02",
  name: "Passo Fundo",
  ibgeCode: "4314100",
  storeCount: 0,
  centerLat: null,
  centerLng: null,
};

function buildRepository(overrides: Partial<CitiesRepository> = {}): CitiesRepository {
  return {
    search: vi.fn().mockResolvedValue([covered, uncovered]),
    find: vi.fn().mockResolvedValue(covered),
    ...overrides,
  };
}

describe("cities.service", () => {
  it("marca a cobertura pela contagem de mercados ativos", async () => {
    const service = createCitiesService(buildRepository());
    const [first, second] = await service.search({ q: "", limit: 20 });
    expect(first).toMatchObject({ name: "Caxias do Sul", storeCount: 6, coverage: "available" });
    expect(second).toMatchObject({ name: "Passo Fundo", storeCount: 0, coverage: "coming_soon" });
  });

  it("devolve null para cidade inexistente", async () => {
    const service = createCitiesService(buildRepository({ find: vi.fn().mockResolvedValue(null) }));
    expect(await service.get(CITY_ID)).toBeNull();
  });
});

describe("CitySearchQuerySchema", () => {
  it("normaliza UF, aplica limite padrão e aparas", () => {
    expect(CitySearchQuerySchema.parse({ q: "  caxias ", uf: "rs" })).toEqual({
      q: "caxias",
      uf: "RS",
      limit: 20,
    });
    expect(CitySearchQuerySchema.parse({})).toEqual({ q: "", limit: 20 });
  });

  it("recusa UF inválida, limite fora da faixa e texto longo demais", () => {
    expect(CitySearchQuerySchema.safeParse({ uf: "RSX" }).success).toBe(false);
    expect(CitySearchQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(CitySearchQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(CitySearchQuerySchema.safeParse({ q: "a".repeat(81) }).success).toBe(false);
  });
});

describe("rotas da biblioteca de cidades", () => {
  function buildApp(limiter = new RateLimiter(100, 60_000)) {
    const cities: CitiesService = {
      search: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    };
    const app = new Hono<AppEnv>();
    app.route("/", citiesRoutes({ cities, searchRateLimiter: limiter }));
    app.onError((error, c) =>
      error instanceof ApiError
        ? c.json(error.toBody(), error.status as 400)
        : c.json({ error: "interno" }, 500),
    );
    return { app, cities };
  }

  it("busca repassa a consulta já validada", async () => {
    const { app, cities } = buildApp();
    const response = await app.request("/v1/cities/search?q=caxias&uf=rs&limit=5");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cities: [] });
    expect(cities.search).toHaveBeenCalledWith({ q: "caxias", uf: "RS", limit: 5 });
  });

  it("busca sem parâmetros devolve os atalhos (consulta vazia)", async () => {
    const { app, cities } = buildApp();
    expect((await app.request("/v1/cities/search")).status).toBe(200);
    expect(cities.search).toHaveBeenCalledWith({ q: "", limit: 20 });
  });

  it("busca com parâmetro inválido responde 400", async () => {
    const { app, cities } = buildApp();
    expect((await app.request("/v1/cities/search?uf=XYZ")).status).toBe(400);
    expect(cities.search).not.toHaveBeenCalled();
  });

  it("busca respeita o limite por IP (429)", async () => {
    const { app } = buildApp(new RateLimiter(1, 60_000));
    const headers = { "x-forwarded-for": "203.0.113.9" };
    expect((await app.request("/v1/cities/search?q=a1", { headers })).status).toBe(200);
    const blocked = await app.request("/v1/cities/search?q=a2", { headers });
    expect(blocked.status).toBe(429);
  });

  it("'search' não é lido como identificador de cidade", async () => {
    const { app, cities } = buildApp();
    await app.request("/v1/cities/search");
    expect(cities.get).not.toHaveBeenCalled();
  });

  it("detalhe: 404 quando não existe, 400 para id inválido, 200 quando existe", async () => {
    const { app, cities } = buildApp();
    expect((await app.request(`/v1/cities/${CITY_ID}`)).status).toBe(404);
    expect((await app.request("/v1/cities/nao-e-uuid")).status).toBe(400);
    vi.mocked(cities.get).mockResolvedValueOnce({
      id: CITY_ID,
      name: "Caxias do Sul",
      uf: "RS",
      ibgeCode: "4305108",
      storeCount: 6,
      coverage: "available",
      centerLat: null,
      centerLng: null,
    });
    // ids diferentes para não cair no cache em memória da resposta anterior
    const ok = await app.request("/v1/cities/6f9a5a2d-2c2b-4d9b-8c1f-8c2a1b0e4d02");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ coverage: "available" });
  });
});
