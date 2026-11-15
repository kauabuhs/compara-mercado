import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type { ListComparison, PriceOffer, SessionUser } from "../contracts";
import { DbError } from "../database/errors";
import { DomainError } from "../lib/domain-error";
import { createLogger } from "../lib/logger";
import { RateLimiter } from "../middlewares/rate-limit";
import type { AdminService } from "../modules/admin/admin.types";
import type { CommunityService } from "../modules/community/community.types";
import type { ContributionService } from "../modules/contributions/contributions.types";
import type { MyListService } from "../modules/my-list/my-list.types";
import type { ProfileService } from "../modules/profile/profile.types";
import type { RegistryService } from "../modules/registry/registry.types";
import type { Services } from "../services";

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
      openModerationTasks: 1,
    }),
    getModerationQueue: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    resolveModerationTask: vi.fn().mockResolvedValue(true),
    getPriceFormOptions: vi.fn().mockResolvedValue({ stores: [], products: [] }),
    getReviewQueue: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    createManualPrice: vi.fn().mockResolvedValue(undefined),
    reviewObservation: vi.fn().mockResolvedValue(true),
    getObservationPhoto: vi.fn().mockResolvedValue(null),
  };
}

function createRegistryServiceStub(): RegistryService {
  const page = { items: [], total: 0 };
  return {
    listCities: vi.fn().mockResolvedValue(page),
    createCity: vi.fn(),
    updateCity: vi.fn().mockResolvedValue(null),
    listStores: vi.fn().mockResolvedValue(page),
    createStore: vi.fn(),
    updateStore: vi.fn().mockResolvedValue(null),
    listCategories: vi.fn().mockResolvedValue(page),
    createCategory: vi.fn(),
    updateCategory: vi.fn().mockResolvedValue(null),
    listProducts: vi.fn().mockResolvedValue(page),
    createProduct: vi.fn(),
    updateProduct: vi.fn().mockResolvedValue(null),
  };
}

function createContributionServiceStub(): ContributionService {
  return {
    submit: vi.fn().mockResolvedValue({ id: OBSERVATION_ID, status: "pending" }),
    listMine: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

function createCommunityServiceStub(): CommunityService {
  return {
    feed: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    confirm: vi.fn().mockResolvedValue({ status: "pending", confirmCount: 1, changedCount: 0 }),
    report: vi.fn().mockResolvedValue(undefined),
    getPhoto: vi.fn().mockResolvedValue(null),
    reputation: vi.fn().mockResolvedValue({ points: 14, level: 0, nextLevelAt: 50, events: [] }),
  };
}

const sampleProfile = {
  email: "admin@example.test",
  displayName: "Maria",
  publicNickname: null,
  phone: null,
  cityId: null,
  termsVersion: "2026-11",
  termsAcceptedAt: "2026-11-09T12:00:00Z",
  createdAt: "2026-11-09T12:00:00Z",
};

function createProfileServiceStub(): ProfileService {
  return {
    get: vi.fn().mockResolvedValue(sampleProfile),
    update: vi.fn().mockResolvedValue({ ...sampleProfile, displayName: "Maria S." }),
  };
}

function buildTestApp(
  options: {
    compareRateLimiter?: RateLimiter;
    submitRateLimiter?: RateLimiter;
    confirmRateLimiter?: RateLimiter;
    reportRateLimiter?: RateLimiter;
    listSyncRateLimiter?: RateLimiter;
  } = {},
) {
  const myListService: MyListService = {
    sync: vi.fn(async (userId: string) => ({ items: [], updatedAt: null, ownerId: userId })),
  };
  const adminService = createAdminServiceStub();
  const registryService = createRegistryServiceStub();
  const contributionService = createContributionServiceStub();
  const profileService = createProfileServiceStub();
  const communityService = createCommunityServiceStub();
  const forget = vi.fn();
  const tokens: Record<string, SessionUser> = {
    "admin-token": adminUser,
    "user-token": regularUser,
    // outra pessoa (id diferente): o limite de envios é por usuário
    "other-token": { ...regularUser, id: "22222222-2222-4222-8222-222222222222" },
  };
  const services: Services = {
    catalog: {
      searchProducts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getProductDetails: vi.fn().mockResolvedValue(null),
      listOffers: vi.fn().mockResolvedValue({ items: [sampleOffer], total: 41 }),
      listStores: vi.fn().mockResolvedValue([]),
      listCities: vi
        .fn()
        .mockResolvedValue([
          { id: "5e8f4f1c-1b1a-4c8a-9b0e-7b1f0a9d3c01", name: "Caxias", uf: "RS" },
        ]),
      compareList: vi.fn().mockResolvedValue(emptyComparison),
    },
    cities: { search: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
    authenticator: { authenticate: vi.fn(async (token: string) => tokens[token] ?? null), forget },
    adminFor: vi.fn(() => adminService),
    registryFor: vi.fn(() => registryService),
    myListFor: vi.fn(() => myListService),
    contributionsFor: vi.fn(() => contributionService),
    communityFor: vi.fn(() => communityService),
    profileFor: vi.fn(() => profileService),
  };
  const app = createApp({
    services,
    logger: createLogger("silent", "api"),
    ...(options.compareRateLimiter ? { compareRateLimiter: options.compareRateLimiter } : {}),
    ...(options.submitRateLimiter ? { submitRateLimiter: options.submitRateLimiter } : {}),
    ...(options.confirmRateLimiter ? { confirmRateLimiter: options.confirmRateLimiter } : {}),
    ...(options.reportRateLimiter ? { reportRateLimiter: options.reportRateLimiter } : {}),
    ...(options.listSyncRateLimiter ? { listSyncRateLimiter: options.listSyncRateLimiter } : {}),
  });
  return {
    app,
    services,
    adminService,
    myListService,
    registryService,
    contributionService,
    profileService,
    communityService,
    forget,
  };
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

    const ok = await app.request("/v1/products/search?q=feijao&pageSize=5&page=2&onlyPriced=1");
    expect(ok.status).toBe(200);
    expect(services.catalog.searchProducts).toHaveBeenCalledWith({
      q: "feijao",
      page: 2,
      pageSize: 5,
      onlyPriced: true,
    });
    expect(await bodyOf(ok)).toMatchObject({ hits: [], total: 0, page: 2, pageSize: 5 });
  });

  it("limita o tamanho máximo da página e rejeita página inválida", async () => {
    const { app } = buildTestApp();
    expect((await app.request("/v1/products/search?q=feijao&pageSize=500")).status).toBe(400);
    expect((await app.request("/v1/products/search?q=feijao&page=0")).status).toBe(400);
    expect((await app.request("/v1/products/search?q=feijao&page=abc")).status).toBe(400);
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
    const body = await bodyOf(offers);
    expect(body.offers).toHaveLength(1);
    expect(body).toMatchObject({ total: 41, page: 1, pageSize: 20 });
    expect(services.catalog.listOffers).toHaveBeenCalledWith({
      sort: "featured",
      expiring: false,
      page: 1,
      pageSize: 20,
    });
    expect((await app.request("/v1/stores")).status).toBe(200);
    expect((await app.request("/v1/offers?storeId=x")).status).toBe(400);
  });

  it("repassa busca, ordenação, filtro de validade e página das ofertas", async () => {
    const { app, services } = buildTestApp();
    const response = await app.request(
      `/v1/offers?q=leite&sort=price&expiring=true&page=3&pageSize=10&storeId=${STORE_ID}`,
    );
    expect(response.status).toBe(200);
    expect(services.catalog.listOffers).toHaveBeenCalledWith({
      q: "leite",
      sort: "price",
      expiring: true,
      page: 3,
      pageSize: 10,
      storeId: STORE_ID,
    });
    expect((await app.request("/v1/offers?sort=aleatorio")).status).toBe(400);
    expect((await app.request("/v1/offers?pageSize=51")).status).toBe(400);
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
    expect(await bodyOf(queue)).toEqual({ observations: [], total: 0, page: 1, pageSize: 20 });
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
    expect(adminService.reviewObservation).toHaveBeenCalledWith(
      OBSERVATION_ID,
      "rejected",
      undefined,
    );
  });

  it("rejeição leva o motivo para o serviço e recusa motivo fora do tamanho", async () => {
    const { app, adminService } = buildTestApp();
    const path = `/v1/admin/observations/${OBSERVATION_ID}/review`;
    for (const note of ["ab", "x".repeat(201)]) {
      const response = await app.request(
        path,
        jsonPost({ decision: "rejected", note }, bearer("admin-token")),
      );
      expect(response.status).toBe(400);
    }
    expect(adminService.reviewObservation).not.toHaveBeenCalled();

    const ok = await app.request(
      path,
      jsonPost(
        { decision: "rejected", note: "  O preço não confere com a foto  " },
        bearer("admin-token"),
      ),
    );
    expect(ok.status).toBe(200);
    expect(adminService.reviewObservation).toHaveBeenCalledWith(
      OBSERVATION_ID,
      "rejected",
      "O preço não confere com a foto",
    );
  });

  describe("moderação", () => {
    const TASK_ID = "7c2d3b4e-5f6a-4b7c-8d9e-0a1b2c3d4e5f";
    const taskPath = `/v1/admin/moderation/${TASK_ID}`;

    it("exige papel admin e lista a fila paginada", async () => {
      const { app, services } = buildTestApp();
      expect((await app.request("/v1/admin/moderation")).status).toBe(401);
      expect(
        (await app.request("/v1/admin/moderation", { headers: bearer("user-token") })).status,
      ).toBe(403);
      expect(services.adminFor).not.toHaveBeenCalled();

      const response = await app.request("/v1/admin/moderation?page=2", {
        headers: bearer("admin-token"),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: [], total: 0, page: 2, pageSize: 20 });
    });

    it("valida a decisão, o id e o motivo antes de chamar o serviço", async () => {
      const { app, adminService } = buildTestApp();
      const bad = [
        { path: taskPath, body: { action: "apagar" } },
        { path: taskPath, body: { action: "reject", note: "ab" } },
        { path: "/v1/admin/moderation/x", body: { action: "keep" } },
      ];
      for (const { path, body } of bad) {
        const response = await app.request(path, jsonPost(body, bearer("admin-token")));
        expect(response.status).toBe(400);
      }
      expect(adminService.resolveModerationTask).not.toHaveBeenCalled();
    });

    it("repassa a decisão com o id do admin e devolve 404 se a tarefa já foi encerrada", async () => {
      const { app, adminService } = buildTestApp();
      const ok = await app.request(
        taskPath,
        jsonPost({ action: "reject", note: "Preço fora da realidade" }, bearer("admin-token")),
      );
      expect(ok.status).toBe(200);
      expect(adminService.resolveModerationTask).toHaveBeenCalledWith(
        TASK_ID,
        { action: "reject", note: "Preço fora da realidade" },
        adminUser.id,
      );

      vi.mocked(adminService.resolveModerationTask).mockResolvedValueOnce(false);
      const gone = await app.request(taskPath, jsonPost({ action: "keep" }, bearer("admin-token")));
      expect(gone.status).toBe(404);
    });
  });

  it("revisar observação inexistente ou já decidida devolve 404, não falso sucesso", async () => {
    // Regressão: o serviço atualizava 0 linhas e a API respondia 200 {ok:true}; um segundo admin
    // achava que a decisão dele tinha valido.
    const { app, adminService } = buildTestApp();
    vi.mocked(adminService.reviewObservation).mockResolvedValueOnce(false);
    const response = await app.request(
      `/v1/admin/observations/${OBSERVATION_ID}/review`,
      jsonPost({ decision: "approved" }, bearer("admin-token")),
    );
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("not_found");
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
    const first = await app.request("/v1/offers?pageSize=10");
    const second = await app.request("/v1/offers?pageSize=10");
    expect(first.headers.get("x-cache")).toBe("MISS");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(services.catalog.listOffers).toHaveBeenCalledTimes(1);

    // página diferente = leitura diferente: não pode vir do cache da página 1
    await app.request("/v1/offers?pageSize=10&page=2");
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

describe("contribuição de preços com foto", () => {
  const photoBytes = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3);

  function multipart(
    overrides: Record<string, string | undefined> = {},
    photo: Blob | null = new File([photoBytes], "etiqueta.jpg", { type: "image/jpeg" }),
  ) {
    const form = new FormData();
    const fields: Record<string, string | undefined> = {
      storeId: STORE_ID,
      productId: PRODUCT_ID,
      priceCents: "599",
      promo: "false",
      ...overrides,
    };
    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined) form.set(name, value);
    }
    if (photo) form.set("photo", photo);
    return form;
  }

  const send = (
    app: ReturnType<typeof buildTestApp>["app"],
    form: FormData,
    token = "user-token",
  ) => app.request("/v1/contributions", { method: "POST", headers: bearer(token), body: form });

  it("exige login (qualquer papel serve)", async () => {
    const { app, services } = buildTestApp();
    const anonymous = await app.request("/v1/contributions", { method: "POST", body: multipart() });
    expect(anonymous.status).toBe(401);
    expect((await app.request("/v1/me/contributions")).status).toBe(401);
    expect(services.contributionsFor).not.toHaveBeenCalled();

    expect((await send(app, multipart(), "user-token")).status).toBe(201);
  });

  it("converte os campos do formulário e repassa o autor e a foto ao serviço", async () => {
    const { app, services, contributionService } = buildTestApp();
    const response = await send(app, multipart({ promo: "true" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: OBSERVATION_ID, status: "pending" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(services.contributionsFor).toHaveBeenCalledWith("user-token");
    expect(contributionService.submit).toHaveBeenCalledWith(regularUser.id, {
      storeId: STORE_ID,
      productId: PRODUCT_ID,
      priceCents: 599,
      promo: true,
      photo: photoBytes,
    });
  });

  it("recusa envio sem foto, com foto vazia ou com campos inválidos, sem chamar o serviço", async () => {
    // limite folgado: aqui o assunto é a validação, não o rate limit
    const { app, contributionService } = buildTestApp({
      submitRateLimiter: new RateLimiter(100, 60_000),
    });
    const invalid = [
      multipart({}, null),
      multipart({}, new File([], "vazia.jpg")),
      multipart({ priceCents: "0" }),
      multipart({ priceCents: "5,99" }),
      multipart({ priceCents: "1000001" }),
      multipart({ storeId: "x" }),
      multipart({ productId: undefined }),
    ];
    for (const form of invalid) expect((await send(app, form)).status).toBe(400);

    const notMultipart = await app.request("/v1/contributions", {
      method: "POST",
      headers: { ...bearer("user-token"), "content-type": "application/json" },
      body: "{}",
    });
    expect(notMultipart.status).toBe(400);
    expect(contributionService.submit).not.toHaveBeenCalled();
  });

  it("traduz os erros de negócio em status HTTP com mensagem segura", async () => {
    const { app, contributionService } = buildTestApp();
    const cases: [string, number][] = [
      ["invalid_photo", 400],
      ["invalid_target", 400],
      ["duplicate_photo", 409],
      ["daily_limit", 429],
    ];
    for (const [code, status] of cases) {
      vi.mocked(contributionService.submit).mockRejectedValueOnce(
        new DomainError(code, `mensagem ${code}`),
      );
      const response = await send(app, multipart());
      expect(response.status).toBe(status);
      expect(await bodyOf(response)).toEqual({
        error: { code, message: `mensagem ${code}` },
      });
    }
  });

  it("não vaza detalhe de falha inesperada do serviço", async () => {
    const { app, contributionService } = buildTestApp();
    vi.mocked(contributionService.submit).mockRejectedValueOnce(new Error("senha=segredo"));
    const response = await send(app, multipart());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("segredo");
  });

  it("aceita foto acima de 64 KB (limite das demais rotas) e recusa acima de 5 MB", async () => {
    const { app } = buildTestApp();
    const large = new File([new Uint8Array(300 * 1024)], "grande.jpg", { type: "image/jpeg" });
    expect((await send(app, multipart({}, large))).status).toBe(201);

    const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "enorme.jpg", {
      type: "image/jpeg",
    });
    const response = await send(app, multipart({}, huge));
    expect(response.status).toBe(413);
    expect((await bodyOf(response)).error.code).toBe("payload_too_large");
  });

  it("limita envios por usuário (não por IP) com Retry-After", async () => {
    const { app } = buildTestApp({ submitRateLimiter: new RateLimiter(2, 60_000) });
    expect((await send(app, multipart(), "user-token")).status).toBe(201);
    expect((await send(app, multipart(), "user-token")).status).toBe(201);
    const blocked = await send(app, multipart(), "user-token");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // outro usuário, mesmo IP: não é afetado
    expect((await send(app, multipart(), "other-token")).status).toBe(201);
  });

  it("lista só os envios do próprio usuário, paginados", async () => {
    const { app, contributionService } = buildTestApp();
    const response = await app.request("/v1/me/contributions?page=2&pageSize=5", {
      headers: bearer("user-token"),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contributions: [], total: 0, page: 2, pageSize: 5 });
    expect(contributionService.listMine).toHaveBeenCalledWith(regularUser.id, {
      page: 2,
      pageSize: 5,
    });
    expect(
      (await app.request("/v1/me/contributions?pageSize=500", { headers: bearer("user-token") }))
        .status,
    ).toBe(400);
  });

  it("a foto da etiqueta é só do admin, sem cache e sem adivinhação de tipo", async () => {
    const { app, adminService } = buildTestApp();
    const path = `/v1/admin/observations/${OBSERVATION_ID}/photo`;
    expect((await app.request(path)).status).toBe(401);
    expect((await app.request(path, { headers: bearer("user-token") })).status).toBe(403);
    expect(adminService.getObservationPhoto).not.toHaveBeenCalled();

    expect((await app.request(path, { headers: bearer("admin-token") })).status).toBe(404);

    vi.mocked(adminService.getObservationPhoto).mockResolvedValueOnce(photoBytes);
    const ok = await app.request(path, { headers: bearer("admin-token") });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(photoBytes);

    expect(
      (await app.request("/v1/admin/observations/x/photo", { headers: bearer("admin-token") }))
        .status,
    ).toBe(400);
  });
});

describe("conta: perfil e cidades", () => {
  const patch = (body: unknown, token = "user-token") => ({
    method: "PATCH",
    headers: { "content-type": "application/json", ...bearer(token) },
    body: JSON.stringify(body),
  });

  it("exige login para ler e editar o perfil", async () => {
    const { app, services } = buildTestApp();
    expect((await app.request("/v1/me/profile")).status).toBe(401);
    expect((await app.request("/v1/me/profile", { method: "PATCH", body: "{}" })).status).toBe(401);
    expect(services.profileFor).not.toHaveBeenCalled();
  });

  it("lê o perfil do usuário logado (qualquer papel) sem cache", async () => {
    const { app, services } = buildTestApp();
    const response = await app.request("/v1/me/profile", { headers: bearer("user-token") });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(services.profileFor).toHaveBeenCalledWith("user-token");
  });

  it("edita só os campos enviados e esquece a sessão em cache", async () => {
    const { app, profileService, forget } = buildTestApp();
    const response = await app.request("/v1/me/profile", patch({ displayName: "Maria S." }));
    expect(response.status).toBe(200);
    expect(profileService.update).toHaveBeenCalledWith(regularUser, { displayName: "Maria S." });
    expect(forget).toHaveBeenCalledWith("user-token");
  });

  it.each([
    ["corpo vazio", {}],
    ["campo desconhecido (papel não se edita)", { role: "admin" }],
    ["nome curto demais", { displayName: "x" }],
    ["apelido com símbolos", { publicNickname: "<script>" }],
    ["apelido curto demais", { publicNickname: "x" }],
    ["apelido longo demais", { publicNickname: "a".repeat(25) }],
    ["cidade que não é uuid", { cityId: "caxias" }],
  ])("recusa %s com 400", async (_label, body) => {
    const { app, profileService } = buildTestApp();
    const response = await app.request("/v1/me/profile", patch(body));
    expect(response.status).toBe(400);
    expect(profileService.update).not.toHaveBeenCalled();
  });

  it("traduz erros de negócio do perfil para 400 com código estável", async () => {
    const { app, profileService, forget } = buildTestApp();
    vi.mocked(profileService.update).mockRejectedValueOnce(
      new DomainError("invalid_phone", "Telefone inválido."),
    );
    const response = await app.request("/v1/me/profile", patch({ phone: "abc" }));
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error.code).toBe("invalid_phone");
    expect(forget).not.toHaveBeenCalled();
  });

  it("lista as cidades habilitadas sem exigir login", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/v1/cities");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { cities: unknown[] }).cities).toHaveLength(1);
  });
});

describe("API — comunidade", () => {
  const CITY_ID = "5e8f4f1c-1b1a-4c8a-9b0e-7b1f0a9d3c01";
  const feedUrl = (extra = "") => `/v1/community/feed?cityId=${CITY_ID}${extra}`;
  const confirmUrl = `/v1/community/observations/${OBSERVATION_ID}/confirmations`;
  const reportUrl = `/v1/community/observations/${OBSERVATION_ID}/reports`;
  const photoUrl = `/v1/community/observations/${OBSERVATION_ID}/photo`;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const post = (body: unknown, token = "user-token") => ({
    method: "POST",
    headers: { ...bearer(token), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const errorCode = async (response: Response) =>
    ((await response.json()) as { error: { code: string } }).error.code;

  it("o feed é público: visitante lê sem login e o serviço recebe `null` no lugar do token", async () => {
    const { app, services, communityService } = buildTestApp();
    const response = await app.request(feedUrl("&promo=1&limit=10"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(services.communityFor).toHaveBeenCalledWith(null);
    expect(communityService.feed).toHaveBeenCalledWith({
      cityId: CITY_ID,
      promoOnly: true,
      limit: 10,
    });
  });

  it("com sessão válida o feed usa o token do usuário e nunca é compartilhado em cache", async () => {
    const { app, services } = buildTestApp();
    const response = await app.request(feedUrl(), { headers: bearer("user-token") });
    expect(response.status).toBe(200);
    expect(services.communityFor).toHaveBeenCalledWith("user-token");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("token inválido no feed é tratado como visitante (a leitura é pública)", async () => {
    const { app, services } = buildTestApp();
    const response = await app.request(feedUrl(), { headers: bearer("token-ruim") });
    expect(response.status).toBe(200);
    expect(services.communityFor).toHaveBeenCalledWith(null);
  });

  it("o feed anônimo sem posição é cacheado; com posição não", async () => {
    const { app, communityService } = buildTestApp();
    expect((await app.request(feedUrl())).headers.get("x-cache")).toBe("MISS");
    expect((await app.request(feedUrl())).headers.get("x-cache")).toBe("HIT");
    expect(communityService.feed).toHaveBeenCalledTimes(1);

    const withPosition = await app.request(feedUrl("&lat=-29.17&lng=-51.18"));
    expect(withPosition.headers.get("x-cache")).toBeNull();
    expect(communityService.feed).toHaveBeenCalledTimes(2);
    expect(vi.mocked(communityService.feed).mock.calls[1]?.[0]).toMatchObject({
      where: { lat: -29.17, lng: -51.18 },
    });
  });

  it.each([
    ["sem cidade", "/v1/community/feed"],
    ["cidade que não é uuid", "/v1/community/feed?cityId=caxias"],
    ["latitude sem longitude", `/v1/community/feed?cityId=${CITY_ID}&lat=-29.1`],
    ["raio sem posição", `/v1/community/feed?cityId=${CITY_ID}&radiusM=1000`],
    ["limite acima do teto", `/v1/community/feed?cityId=${CITY_ID}&limit=51`],
  ])("recusa o feed %s com 400", async (_label, url) => {
    const { app, communityService } = buildTestApp();
    expect((await app.request(url)).status).toBe(400);
    expect(communityService.feed).not.toHaveBeenCalled();
  });

  it("cursor inválido vira 400 com código estável", async () => {
    const { app, communityService } = buildTestApp();
    vi.mocked(communityService.feed).mockRejectedValueOnce(
      new DomainError("invalid_cursor", "Cursor de paginação inválido."),
    );
    const response = await app.request(feedUrl("&cursor=lixo"));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_cursor");
  });

  it("confirmar, denunciar, ver foto e reputação exigem login", async () => {
    const { app, services } = buildTestApp();
    const anonymousPost = (url: string, body: unknown) =>
      app.request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await anonymousPost(confirmUrl, { verdict: "confirm" })).status).toBe(401);
    expect((await anonymousPost(reportUrl, { reason: "spam" })).status).toBe(401);
    expect((await app.request(photoUrl)).status).toBe(401);
    expect((await app.request("/v1/me/reputation")).status).toBe(401);
    expect(services.communityFor).not.toHaveBeenCalled();
  });

  it("confirma a publicação com o token do usuário e devolve o resultado", async () => {
    const { app, services, communityService } = buildTestApp();
    const response = await app.request(confirmUrl, post({ verdict: "confirm" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending", confirmCount: 1, changedCount: 0 });
    expect(services.communityFor).toHaveBeenCalledWith("user-token");
    expect(communityService.confirm).toHaveBeenCalledWith(OBSERVATION_ID, "confirm");
  });

  it.each([
    ["veredito desconhecido", { verdict: "talvez" }],
    ["corpo vazio", {}],
    ["campo extra", { verdict: "confirm", userId: "x" }],
  ])("recusa confirmação com %s", async (_label, body) => {
    const { app, communityService } = buildTestApp();
    expect((await app.request(confirmUrl, post(body))).status).toBe(400);
    expect(communityService.confirm).not.toHaveBeenCalled();
  });

  it("recusa id de publicação que não é uuid", async () => {
    const { app } = buildTestApp();
    const response = await app.request(
      "/v1/community/observations/abc/confirmations",
      post({ verdict: "confirm" }),
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["own_observation", 403],
    ["observation_unavailable", 404],
    ["already_done", 409],
    ["daily_limit", 429],
  ])("traduz %s para HTTP %i", async (code, status) => {
    const { app, communityService } = buildTestApp();
    vi.mocked(communityService.confirm).mockRejectedValueOnce(new DomainError(code, "msg"));
    const response = await app.request(confirmUrl, post({ verdict: "confirm" }));
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
  });

  it("limita as confirmações por usuário, sem punir outra pessoa", async () => {
    const { app, communityService } = buildTestApp({
      confirmRateLimiter: new RateLimiter(2, 60_000),
    });
    const confirm = (token: string) => app.request(confirmUrl, post({ verdict: "confirm" }, token));
    expect((await confirm("user-token")).status).toBe(200);
    expect((await confirm("user-token")).status).toBe(200);
    const limited = await confirm("user-token");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
    expect((await confirm("other-token")).status).toBe(200);
    expect(communityService.confirm).toHaveBeenCalledTimes(3);
  });

  it("denuncia com um motivo válido e responde 201", async () => {
    const { app, communityService } = buildTestApp();
    const response = await app.request(reportUrl, post({ reason: "wrong_price" }));
    expect(response.status).toBe(201);
    expect(communityService.report).toHaveBeenCalledWith(OBSERVATION_ID, "wrong_price");

    const invalid = await app.request(reportUrl, post({ reason: "odeio" }));
    expect(invalid.status).toBe(400);
  });

  it("serve a foto como JPEG privado, ou 404 se não houver foto visível", async () => {
    const { app, communityService } = buildTestApp();
    const missing = await app.request(photoUrl, { headers: bearer("user-token") });
    expect(missing.status).toBe(404);

    vi.mocked(communityService.getPhoto).mockResolvedValueOnce(new Uint8Array([0xff, 0xd8, 0xff]));
    const found = await app.request(photoUrl, { headers: bearer("user-token") });
    expect(found.status).toBe(200);
    expect(found.headers.get("content-type")).toBe("image/jpeg");
    expect(found.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await found.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it("devolve a reputação do próprio usuário", async () => {
    const { app, communityService } = buildTestApp();
    const response = await app.request("/v1/me/reputation", { headers: bearer("user-token") });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ points: 14, level: 0, nextLevelAt: 50 });
    expect(communityService.reputation).toHaveBeenCalledWith(regularUser.id);
  });
});

describe("cadastro-base (admin)", () => {
  const CITY_ID = "5e8f4f1c-1b1a-4c8a-9b0e-7b1f0a9d3c01";
  const jsonPatch = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const validCity = { name: "Passo Fundo", uf: "rs", ibgeCode: "4314100" };
  const validStore = {
    name: "Mercado Centro",
    cityId: CITY_ID,
    lat: -29.17,
    lng: -51.18,
  };
  const validProduct = { name: "Arroz Tipo 1", sizeValue: 5, sizeUnit: "kg" };

  it("exige login e papel admin em toda rota, sem tocar nos dados", async () => {
    const { app, services } = buildTestApp();
    const requests: [string, RequestInit][] = [
      ["/v1/admin/cities", {}],
      ["/v1/admin/stores", {}],
      ["/v1/admin/categories", {}],
      ["/v1/admin/products", {}],
      ["/v1/admin/cities", jsonPost(validCity)],
      [`/v1/admin/cities/${CITY_ID}`, jsonPatch({ active: true })],
    ];
    for (const [path, init] of requests) {
      expect((await app.request(path, init)).status).toBe(401);
      const asUser = { ...init, headers: { ...init.headers, ...bearer("user-token") } };
      expect((await app.request(path, asUser)).status).toBe(403);
    }
    expect(services.registryFor).not.toHaveBeenCalled();
  });

  it("lista com paginação e filtros validados", async () => {
    const { app, registryService } = buildTestApp();
    const response = await app.request("/v1/admin/products?q=arroz&situation=inactive&page=2", {
      headers: bearer("admin-token"),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], total: 0, page: 2, pageSize: 20 });
    expect(registryService.listProducts).toHaveBeenCalledWith({
      q: "arroz",
      situation: "inactive",
      page: 2,
      pageSize: 20,
    });
    const invalid = await app.request("/v1/admin/products?situation=qualquer", {
      headers: bearer("admin-token"),
    });
    expect(invalid.status).toBe(400);
  });

  it("cria cidade normalizando a UF e recusa corpo inválido", async () => {
    const { app, registryService } = buildTestApp();
    const invalid = [
      { ...validCity, ibgeCode: "123" },
      { ...validCity, uf: "RSX" },
      { ...validCity, name: "A" },
    ];
    for (const body of invalid) {
      const response = await app.request("/v1/admin/cities", jsonPost(body, bearer("admin-token")));
      expect(response.status).toBe(400);
    }
    expect(registryService.createCity).not.toHaveBeenCalled();

    vi.mocked(registryService.createCity).mockResolvedValue({
      id: CITY_ID,
      name: "Passo Fundo",
      uf: "RS",
      ibgeCode: "4314100",
      active: false,
    });
    const created = await app.request(
      "/v1/admin/cities",
      jsonPost(validCity, bearer("admin-token")),
    );
    expect(created.status).toBe(201);
    expect(registryService.createCity).toHaveBeenCalledWith({
      name: "Passo Fundo",
      uf: "RS",
      ibgeCode: "4314100",
      active: false,
    });
  });

  it("traduz duplicidade (409) e referência inexistente (400) em respostas padronizadas", async () => {
    const { app, registryService } = buildTestApp();
    vi.mocked(registryService.createCity).mockRejectedValue(
      new DomainError("duplicate", "Já existe um registro com esses dados."),
    );
    const duplicate = await app.request(
      "/v1/admin/cities",
      jsonPost(validCity, bearer("admin-token")),
    );
    expect(duplicate.status).toBe(409);
    expect((await bodyOf(duplicate)).error.code).toBe("duplicate");

    vi.mocked(registryService.createStore).mockRejectedValue(
      new DomainError("invalid_reference", "Uma das referências informadas não existe."),
    );
    const orphan = await app.request(
      "/v1/admin/stores",
      jsonPost(validStore, bearer("admin-token")),
    );
    expect(orphan.status).toBe(400);
    expect((await bodyOf(orphan)).error.code).toBe("invalid_reference");
  });

  it("cria mercado com padrões (ativo, sem CNPJ) e valida coordenadas", async () => {
    const { app, registryService } = buildTestApp();
    for (const body of [
      { ...validStore, lat: 91 },
      { ...validStore, lng: -181 },
      { ...validStore, cnpj: "12.345.678/0001-90" },
      { ...validStore, cityId: "x" },
    ]) {
      const response = await app.request("/v1/admin/stores", jsonPost(body, bearer("admin-token")));
      expect(response.status).toBe(400);
    }
    vi.mocked(registryService.createStore).mockResolvedValue({
      id: STORE_ID,
      ...validStore,
      cityName: "Passo Fundo",
      cnpj: null,
      address: null,
      neighborhood: null,
      status: "active",
    });
    const created = await app.request(
      "/v1/admin/stores",
      jsonPost(validStore, bearer("admin-token")),
    );
    expect(created.status).toBe(201);
    expect(registryService.createStore).toHaveBeenCalledWith({
      ...validStore,
      cnpj: null,
      address: null,
      neighborhood: null,
      status: "active",
    });
  });

  it("PATCH exige ao menos um campo e as coordenadas juntas; 404 quando não existe", async () => {
    const { app, registryService } = buildTestApp();
    const empty = await app.request(
      `/v1/admin/stores/${STORE_ID}`,
      jsonPatch({}, bearer("admin-token")),
    );
    expect(empty.status).toBe(400);
    const halfPoint = await app.request(
      `/v1/admin/stores/${STORE_ID}`,
      jsonPatch({ lat: -29.1 }, bearer("admin-token")),
    );
    expect(halfPoint.status).toBe(400);
    expect(registryService.updateStore).not.toHaveBeenCalled();

    const missing = await app.request(
      `/v1/admin/stores/${STORE_ID}`,
      jsonPatch({ status: "inactive" }, bearer("admin-token")),
    );
    expect(missing.status).toBe(404);
    expect(registryService.updateStore).toHaveBeenCalledWith(STORE_ID, { status: "inactive" });

    const badId = await app.request(
      "/v1/admin/stores/nao-e-uuid",
      jsonPatch({ status: "active" }, bearer("admin-token")),
    );
    expect(badId.status).toBe(400);
  });

  it("produto: GTIN malformado é recusado e o arquivamento chega ao serviço", async () => {
    const { app, registryService } = buildTestApp();
    const badGtin = await app.request(
      "/v1/admin/products",
      jsonPost({ ...validProduct, gtin: "123" }, bearer("admin-token")),
    );
    expect(badGtin.status).toBe(400);
    const badSize = await app.request(
      "/v1/admin/products",
      jsonPost({ ...validProduct, sizeValue: 0 }, bearer("admin-token")),
    );
    expect(badSize.status).toBe(400);
    expect(registryService.createProduct).not.toHaveBeenCalled();

    vi.mocked(registryService.updateProduct).mockResolvedValue({
      id: PRODUCT_ID,
      name: "Arroz Tipo 1",
      brand: null,
      categoryId: null,
      gtin: null,
      sizeValue: 5,
      sizeUnit: "kg",
      status: "archived",
    });
    const archived = await app.request(
      `/v1/admin/products/${PRODUCT_ID}`,
      jsonPatch({ status: "archived" }, bearer("admin-token")),
    );
    expect(archived.status).toBe(200);
    expect(registryService.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { status: "archived" });
  });
});

describe("lista de compras na conta", () => {
  const PRODUCT_B = "7e2d3b4e-5f6a-4b7c-8d9e-0a1b2c3d4e5f";
  const validSync = {
    items: [{ productId: PRODUCT_ID, quantity: 2 }],
    baseUpdatedAt: null,
    dirty: true,
    localOwnerId: null,
  };

  it("exige login e não toca nos dados sem ele", async () => {
    const { app, services } = buildTestApp();
    const anonymous = await app.request("/v1/me/list/sync", jsonPost(validSync));
    expect(anonymous.status).toBe(401);
    expect(services.myListFor).not.toHaveBeenCalled();
  });

  it("repassa o pedido com o id da pessoa e devolve a lista sem cache", async () => {
    const { app, myListService, services } = buildTestApp();
    const response = await app.request(
      "/v1/me/list/sync",
      jsonPost(validSync, bearer("user-token")),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ items: [], updatedAt: null, ownerId: regularUser.id });
    expect(services.myListFor).toHaveBeenCalledWith("user-token");
    expect(myListService.sync).toHaveBeenCalledWith(regularUser.id, validSync);
  });

  it("valida o corpo: quantidade, produto, tamanho da lista e campos obrigatórios", async () => {
    const { app, myListService } = buildTestApp();
    const tooMany = Array.from({ length: 101 }, (_, index) => ({
      productId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      quantity: 1,
    }));
    const invalid = [
      { ...validSync, items: [{ productId: PRODUCT_ID, quantity: 0 }] },
      { ...validSync, items: [{ productId: PRODUCT_ID, quantity: 100 }] },
      { ...validSync, items: [{ productId: PRODUCT_ID, quantity: 1.5 }] },
      { ...validSync, items: [{ productId: "x", quantity: 1 }] },
      { ...validSync, items: tooMany },
      { ...validSync, localOwnerId: "nao-e-uuid" },
      { items: validSync.items },
    ];
    for (const body of invalid) {
      const response = await app.request("/v1/me/list/sync", jsonPost(body, bearer("user-token")));
      expect(response.status).toBe(400);
    }
    expect(myListService.sync).not.toHaveBeenCalled();
    // lista vazia e dois produtos são válidos
    const ok = await app.request(
      "/v1/me/list/sync",
      jsonPost(
        {
          ...validSync,
          items: [
            { productId: PRODUCT_ID, quantity: 1 },
            { productId: PRODUCT_B, quantity: 99 },
          ],
        },
        bearer("user-token"),
      ),
    );
    expect(ok.status).toBe(200);
  });

  it("limita as sincronizações por pessoa, sem bloquear outra pessoa", async () => {
    const { app } = buildTestApp({ listSyncRateLimiter: new RateLimiter(2, 60_000) });
    const sync = (token: string) =>
      app.request("/v1/me/list/sync", jsonPost(validSync, bearer(token)));
    expect((await sync("user-token")).status).toBe(200);
    expect((await sync("user-token")).status).toBe(200);
    const blocked = await sync("user-token");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();
    expect((await sync("other-token")).status).toBe(200);
  });
});
