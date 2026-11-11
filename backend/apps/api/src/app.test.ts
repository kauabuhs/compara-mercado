import type { ListComparison, PriceOffer, SessionUser } from "@compara/contracts";
import { DbError } from "@compara/db";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { RateLimiter } from "./http/rate-limit";
import { createLogger } from "./logger";
import type { AdminService, Services } from "./services/types";

const PRODUCT_ID = "6f1b1b0e-5b0e-4b7a-9d57-2d6f6c2a7e11";
const STORE_ID = "0a7a3c3e-3f19-4a53-8d44-3c0f5d6d9a01";
const OBSERVATION_ID = "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b22";

const adminUser: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.test",
  role: "admin",
  displayName: null,
};
const regularUser: SessionUser = { ...adminUser, role: "user" };

const emptyComparison: ListComparison = { stores: [], bestSingle: null, bestSplit: null };

const sampleOffer: PriceOffer = {
  storeId: STORE_ID,
  productId: PRODUCT_ID,
  priceCents: 599,
  unitPriceCents: 599,
  promo: false,
  validTo: null,
  observedAt: "2026-11-09T12:00:00Z",
  storeName: "Mercado Teste",
  storeNeighborhood: null,
  productName: "Arroz 1kg",
  brand: null,
  sizeValue: 1,
  sizeUnit: "kg",
  baseUnit: "kg",
  categoryId: null,
  ageDays: 1,
  freshness: "fresh",
};

function createAdminServiceStub(): AdminService {
  return {
    getOverview: vi.fn().mockResolvedValue({
      pendingReviews: 2,
      activeStores: 6,
      activeProducts: 48,
      currentPrices: 265,
    }),
    getPriceFormOptions: vi.fn().mockResolvedValue({ stores: [], products: [] }),
    getReviewQueue: vi.fn().mockResolvedValue([]),
    createManualPrice: vi.fn().mockResolvedValue(undefined),
    reviewObservation: vi.fn().mockResolvedValue(undefined),
  };
}

function buildTestApp(options: { compareRateLimiter?: RateLimiter } = {}) {
  const adminService = createAdminServiceStub();
  const tokens: Record<string, SessionUser> = {
    "admin-token": adminUser,
    "user-token": regularUser,
  };
  const services: Services = {
    catalog: {
      searchProducts: vi.fn().mockResolvedValue([]),
      getProductDetails: vi.fn().mockResolvedValue(null),
      listOffers: vi.fn().mockResolvedValue([sampleOffer]),
      listStores: vi.fn().mockResolvedValue([]),
      compareList: vi.fn().mockResolvedValue(emptyComparison),
    },
    authenticator: { authenticate: vi.fn(async (token: string) => tokens[token] ?? null) },
    adminFor: vi.fn(() => adminService),
  };
  const app = createApp({
    services,
    logger: createLogger("silent"),
    ...(options.compareRateLimiter ? { compareRateLimiter: options.compareRateLimiter } : {}),
  });
  return { app, services, adminService };
}

interface ResponseBody {
  error: { code: string; message: string };
  offers: unknown[];
  pendingReviews: number;
}
const bodyOf = async (response: Response) => (await response.json()) as ResponseBody;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const jsonPost = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

describe("saúde e rotas desconhecidas", () => {
  it("responde /healthz", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ status: "ok" });
  });

  it("devolve 404 no formato padrão de erro", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/v1/nao-existe");
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual({
      error: { code: "not_found", message: "Rota não encontrada." },
    });
  });

  it("envia cabeçalhos de segurança e um identificador de requisição", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/healthz", { headers: { "x-request-id": "abcdef123456" } });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBe("abcdef123456");
  });

  it("ignora x-request-id malformado e gera outro", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/healthz", {
      headers: { "x-request-id": "id com espaco" },
    });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("catálogo público", () => {
  it("busca produtos validando o termo", async () => {
    const { app, services } = buildTestApp();
    expect((await app.request("/v1/products/search?q=a")).status).toBe(400);
    expect((await app.request("/v1/products/search")).status).toBe(400);

    const ok = await app.request("/v1/products/search?q=feijao&limit=5");
    expect(ok.status).toBe(200);
    expect(services.catalog.searchProducts).toHaveBeenCalledWith({ q: "feijao", limit: 5 });
  });

  it("limita o tamanho máximo do resultado", async () => {
    const { app } = buildTestApp();
    expect((await app.request("/v1/products/search?q=feijao&limit=500")).status).toBe(400);
  });

  it("rejeita id inválido e responde 404 quando o produto não existe", async () => {
    const { app } = buildTestApp();
    expect((await app.request("/v1/products/nao-e-uuid")).status).toBe(400);
    const missing = await app.request(`/v1/products/${PRODUCT_ID}`);
    expect(missing.status).toBe(404);
    expect((await bodyOf(missing)).error.code).toBe("not_found");
  });

  it("lista ofertas e mercados com valores padrão", async () => {
    const { app, services } = buildTestApp();
    const offers = await app.request("/v1/offers");
    expect(offers.status).toBe(200);
    expect((await bodyOf(offers)).offers).toHaveLength(1);
    expect(services.catalog.listOffers).toHaveBeenCalledWith({ limit: 60 });
    expect((await app.request("/v1/stores")).status).toBe(200);
    expect((await app.request("/v1/offers?storeId=x")).status).toBe(400);
  });
});

describe("comparar lista", () => {
  const validBody = { items: [{ productId: PRODUCT_ID, quantity: 2 }] };

  it("valida o corpo", async () => {
    const { app } = buildTestApp();
    expect((await app.request("/v1/shopping-lists/compare", jsonPost({ items: [] }))).status).toBe(
      400,
    );
    const notJson = await app.request("/v1/shopping-lists/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{quebrado",
    });
    expect(notJson.status).toBe(400);
  });

  it("compara a lista", async () => {
    const { app, services } = buildTestApp();
    const response = await app.request("/v1/shopping-lists/compare", jsonPost(validBody));
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual(emptyComparison);
    expect(services.catalog.compareList).toHaveBeenCalledWith(validBody);
  });

  it("aplica limite por IP com Retry-After, sem afetar outro IP", async () => {
    const { app } = buildTestApp({ compareRateLimiter: new RateLimiter(2, 60_000) });
    const call = (ip: string) =>
      app.request("/v1/shopping-lists/compare", jsonPost(validBody, { "x-forwarded-for": ip }));

    expect((await call("203.0.113.1")).status).toBe(200);
    expect((await call("203.0.113.1")).status).toBe(200);
    const blocked = await call("203.0.113.1");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await bodyOf(blocked)).error.code).toBe("rate_limited");
    expect((await call("203.0.113.2")).status).toBe(200);
  });

  it("recusa corpo grande demais", async () => {
    const { app } = buildTestApp();
    const huge = { items: [{ productId: PRODUCT_ID, quantity: 1 }], padding: "x".repeat(70_000) };
    const response = await app.request("/v1/shopping-lists/compare", jsonPost(huge));
    expect(response.status).toBe(413);
  });
});

describe("autenticação", () => {
  it("/v1/me exige token válido", async () => {
    const { app } = buildTestApp();
    const anonymous = await app.request("/v1/me");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toBe("Bearer");

    const invalid = await app.request("/v1/me", { headers: bearer("token-falso") });
    expect(invalid.status).toBe(401);
    expect((await bodyOf(invalid)).error.code).toBe("invalid_token");

    const malformed = await app.request("/v1/me", { headers: { authorization: "Basic abc" } });
    expect(malformed.status).toBe(401);
  });

  it("devolve o usuário e impede cache", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/v1/me", { headers: bearer("user-token") });
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual(regularUser);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("administração", () => {
  const validPrice = { storeId: STORE_ID, productId: PRODUCT_ID, priceCents: 599, promo: false };

  it("bloqueia sem token (401) e sem papel admin (403), sem tocar nos dados", async () => {
    const { app, services } = buildTestApp();
    expect((await app.request("/v1/admin/overview")).status).toBe(401);
    const forbidden = await app.request("/v1/admin/overview", { headers: bearer("user-token") });
    expect(forbidden.status).toBe(403);
    expect(services.adminFor).not.toHaveBeenCalled();

    const write = await app.request("/v1/admin/prices", jsonPost(validPrice, bearer("user-token")));
    expect(write.status).toBe(403);
    expect(services.adminFor).not.toHaveBeenCalled();
  });

  it("rotas desconhecidas fora de /v1/admin continuam 404 (não pedem login)", async () => {
    const { app } = buildTestApp();
    expect((await app.request("/v1/qualquer")).status).toBe(404);
  });

  it("admin lê painel, opções e fila", async () => {
    const { app, services } = buildTestApp();
    const overview = await app.request("/v1/admin/overview", { headers: bearer("admin-token") });
    expect(overview.status).toBe(200);
    expect((await bodyOf(overview)).pendingReviews).toBe(2);
    expect(services.adminFor).toHaveBeenCalledWith("admin-token");
    expect(
      (await app.request("/v1/admin/price-form-options", { headers: bearer("admin-token") }))
        .status,
    ).toBe(200);
    const queue = await app.request("/v1/admin/review-queue", { headers: bearer("admin-token") });
    expect(await bodyOf(queue)).toEqual({ observations: [] });
  });

  it("lança preço validando o corpo e registrando o autor", async () => {
    const { app, adminService } = buildTestApp();
    const invalidBodies = [
      { ...validPrice, priceCents: 0 },
      { ...validPrice, priceCents: 5.5 },
      { ...validPrice, storeId: "x" },
      { ...validPrice, validTo: "amanhã" },
    ];
    for (const body of invalidBodies) {
      const response = await app.request("/v1/admin/prices", jsonPost(body, bearer("admin-token")));
      expect(response.status).toBe(400);
    }
    expect(adminService.createManualPrice).not.toHaveBeenCalled();

    const created = await app.request(
      "/v1/admin/prices",
      jsonPost({ ...validPrice, promo: true, validTo: "2026-11-20" }, bearer("admin-token")),
    );
    expect(created.status).toBe(201);
    expect(adminService.createManualPrice).toHaveBeenCalledWith(
      { ...validPrice, promo: true, validTo: "2026-11-20" },
      adminUser.id,
    );
  });

  it("revisa observação validando id e decisão", async () => {
    const { app, adminService } = buildTestApp();
    const path = `/v1/admin/observations/${OBSERVATION_ID}/review`;
    expect(
      (await app.request(path, jsonPost({ decision: "talvez" }, bearer("admin-token")))).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          "/v1/admin/observations/x/review",
          jsonPost({ decision: "approved" }, bearer("admin-token")),
        )
      ).status,
    ).toBe(400);

    const ok = await app.request(path, jsonPost({ decision: "rejected" }, bearer("admin-token")));
    expect(ok.status).toBe(200);
    expect(adminService.reviewObservation).toHaveBeenCalledWith(OBSERVATION_ID, "rejected");
  });
});

describe("erros de dados", () => {
  it("não vaza detalhe interno de falha do banco", async () => {
    const { app, services } = buildTestApp();
    vi.mocked(services.catalog.listStores).mockRejectedValueOnce(
      new DbError('relation "secret_table" does not exist', "42P01"),
    );
    const response = await app.request("/v1/stores");
    expect(response.status).toBe(502);
    const body = await bodyOf(response);
    expect(body.error.code).toBe("data_unavailable");
    expect(JSON.stringify(body)).not.toContain("secret_table");
  });

  it("trata erro inesperado como 500 genérico", async () => {
    const { app, services } = buildTestApp();
    vi.mocked(services.catalog.listStores).mockRejectedValueOnce(new Error("senha=abc123"));
    const response = await app.request("/v1/stores");
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("abc123");
  });
});

describe("cache das leituras públicas", () => {
  it("serve a segunda leitura sem consultar os dados", async () => {
    const { app, services } = buildTestApp();
    const first = await app.request("/v1/offers?limit=10");
    const second = await app.request("/v1/offers?limit=10");
    expect(first.headers.get("x-cache")).toBe("MISS");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(services.catalog.listOffers).toHaveBeenCalledTimes(1);

    await app.request("/v1/offers?limit=20");
    expect(services.catalog.listOffers).toHaveBeenCalledTimes(2);
  });

  it("nunca cacheia comparação, sessão nem administração", async () => {
    const { app, services, adminService } = buildTestApp();
    const compareBody = { items: [{ productId: PRODUCT_ID, quantity: 1 }] };
    await app.request("/v1/shopping-lists/compare", jsonPost(compareBody));
    await app.request("/v1/shopping-lists/compare", jsonPost(compareBody));
    expect(services.catalog.compareList).toHaveBeenCalledTimes(2);

    const adminHeaders = { headers: bearer("admin-token") };
    const overview = await app.request("/v1/admin/overview", adminHeaders);
    await app.request("/v1/admin/overview", adminHeaders);
    expect(overview.headers.get("x-cache")).toBeNull();
    expect(adminService.getOverview).toHaveBeenCalledTimes(2);
  });
});
