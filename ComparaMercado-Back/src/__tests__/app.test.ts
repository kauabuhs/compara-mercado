import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type { ListComparison, PriceOffer, SessionUser } from "../contracts";
import { DbError } from "../database/errors";
import { DomainError } from "../lib/domain-error";
import { createLogger } from "../lib/logger";
import { RateLimiter } from "../middlewares/rate-limit";
import type { AdminService } from "../modules/admin/admin.types";
import type { ContributionService } from "../modules/contributions/contributions.types";
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
    }),
    getPriceFormOptions: vi.fn().mockResolvedValue({ stores: [], products: [] }),
    getReviewQueue: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    createManualPrice: vi.fn().mockResolvedValue(undefined),
    reviewObservation: vi.fn().mockResolvedValue(true),
    getObservationPhoto: vi.fn().mockResolvedValue(null),
  };
}

function createContributionServiceStub(): ContributionService {
  return {
    submit: vi.fn().mockResolvedValue({ id: OBSERVATION_ID, status: "pending" }),
    listMine: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

function buildTestApp(
  options: { compareRateLimiter?: RateLimiter; submitRateLimiter?: RateLimiter } = {},
) {
  const adminService = createAdminServiceStub();
  const contributionService = createContributionServiceStub();
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
      compareList: vi.fn().mockResolvedValue(emptyComparison),
    },
    authenticator: { authenticate: vi.fn(async (token: string) => tokens[token] ?? null) },
    adminFor: vi.fn(() => adminService),
    contributionsFor: vi.fn(() => contributionService),
  };
  const app = createApp({
    services,
    logger: createLogger("silent", "api"),
    ...(options.compareRateLimiter ? { compareRateLimiter: options.compareRateLimiter } : {}),
    ...(options.submitRateLimiter ? { submitRateLimiter: options.submitRateLimiter } : {}),
  });
  return { app, services, adminService, contributionService };
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
    expect(adminService.reviewObservation).toHaveBeenCalledWith(OBSERVATION_ID, "rejected");
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
