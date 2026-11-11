import {
  AdminOverviewSchema,
  ListComparisonSchema,
  OffersResponseSchema,
  PriceFormOptionsSchema,
  ProductDetailsSchema,
  ReviewQueueResponseSchema,
  SearchProductsResponseSchema,
  SessionUserSchema,
  StoresResponseSchema,
} from "@compara/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createLogger } from "./logger";
import { createSupabaseServices } from "./services/supabase-services";

// Roda contra o Supabase LOCAL com o seed (`pnpm db:start`). Fica ignorado sem as variáveis:
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=<anon> pnpm --filter @compara/api test
// O trecho de admin também exige SUPABASE_TEST_ADMIN_EMAIL e SUPABASE_TEST_ADMIN_PASSWORD
// (o admin do seed local; não existe em staging/produção). Todos os testes são somente leitura.
const supabaseUrl = process.env["SUPABASE_TEST_URL"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const adminEmail = process.env["SUPABASE_TEST_ADMIN_EMAIL"];
const adminPassword = process.env["SUPABASE_TEST_ADMIN_PASSWORD"];

describe.skipIf(!supabaseUrl || !anonKey)("API contra o Supabase local", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp({
      services: createSupabaseServices({
        supabaseUrl: String(supabaseUrl),
        supabaseAnonKey: String(anonKey),
      }),
      logger: createLogger("silent"),
    });
  });

  async function getJson(path: string, accessToken?: string) {
    const response = await app.request(path, {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  async function firstProductIds(count: number): Promise<string[]> {
    const { body } = await getJson("/v1/products/search?q=arroz&limit=10");
    return SearchProductsResponseSchema.parse(body)
      .hits.slice(0, count)
      .map((hit) => hit.productId);
  }

  it("busca tolerando erro de digitação e respeitando o contrato", async () => {
    const { status, body } = await getJson("/v1/products/search?q=feijao");
    expect(status).toBe(200);
    const { hits } = SearchProductsResponseSchema.parse(body);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.name.toLowerCase().includes("feijão"))).toBe(true);
  });

  it("detalha o produto com preços ordenados e frescor calculado pela API", async () => {
    const [productId] = await firstProductIds(1);
    const { status, body } = await getJson(`/v1/products/${productId}`);
    expect(status).toBe(200);
    const details = ProductDetailsSchema.parse(body);
    expect(details.prices.length).toBeGreaterThan(0);
    const unitPrices = details.prices.map((price) => price.unitPriceCents);
    expect(unitPrices).toEqual([...unitPrices].sort((a, b) => a - b));
    for (const price of details.prices) {
      expect(price.ageDays).toBeGreaterThanOrEqual(0);
      expect(["fresh", "recent", "stale"]).toContain(price.freshness);
    }
  });

  it("responde 404 para produto inexistente e 400 para id inválido", async () => {
    expect((await getJson("/v1/products/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await getJson("/v1/products/nao-e-uuid")).status).toBe(400);
  });

  it("lista só promoções em /v1/offers e os mercados ativos em /v1/stores", async () => {
    const offers = OffersResponseSchema.parse((await getJson("/v1/offers?limit=20")).body).offers;
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((offer) => offer.promo)).toBe(true);

    const stores = StoresResponseSchema.parse((await getJson("/v1/stores")).body).stores;
    expect(stores.length).toBeGreaterThan(0);
    expect(stores.every((store) => Number.isFinite(store.lat) && Number.isFinite(store.lng))).toBe(
      true,
    );
  });

  it("compara uma lista entre mercados", async () => {
    const productIds = await firstProductIds(3);
    const response = await app.request("/v1/shopping-lists/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: productIds.map((productId, index) => ({ productId, quantity: index + 1 })),
      }),
    });
    expect(response.status).toBe(200);
    const comparison = ListComparisonSchema.parse(await response.json());
    expect(comparison.bestSingle).not.toBeNull();
    expect(comparison.stores.length).toBeGreaterThan(0);
  });

  it("recusa acesso sem token ou com token inválido", async () => {
    expect((await getJson("/v1/me")).status).toBe(401);
    expect((await getJson("/v1/admin/overview")).status).toBe(401);
    expect((await getJson("/v1/me", "token.invalido.qualquer")).status).toBe(401);
    expect((await getJson("/v1/admin/overview", "token.invalido.qualquer")).status).toBe(401);
  });

  describe.skipIf(!adminEmail || !adminPassword)("com o admin do seed local", () => {
    let adminToken = "";

    beforeAll(async () => {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: String(anonKey), "content-type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      adminToken = ((await response.json()) as { access_token: string }).access_token;
    });

    it("identifica o usuário e o papel lidos do banco", async () => {
      const { status, body } = await getJson("/v1/me", adminToken);
      expect(status).toBe(200);
      expect(SessionUserSchema.parse(body)).toMatchObject({ email: adminEmail, role: "admin" });
    });

    it("lê painel, opções do formulário e fila de revisão sob a RLS do próprio admin", async () => {
      const overview = AdminOverviewSchema.parse(
        (await getJson("/v1/admin/overview", adminToken)).body,
      );
      expect(overview.activeStores).toBeGreaterThan(0);
      expect(overview.currentPrices).toBeGreaterThan(0);

      const options = PriceFormOptionsSchema.parse(
        (await getJson("/v1/admin/price-form-options", adminToken)).body,
      );
      expect(options.products.length).toBeGreaterThan(10);

      expect(
        ReviewQueueResponseSchema.safeParse(
          (await getJson("/v1/admin/review-queue", adminToken)).body,
        ).success,
      ).toBe(true);
    });

    it("revisar observação inexistente devolve 404 (antes: 200 {ok:true} sem ter decidido nada)", async () => {
      const response = await app.request(
        "/v1/admin/observations/00000000-0000-4000-8000-0000000000aa/review",
        {
          method: "POST",
          headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({ decision: "approved" }),
        },
      );
      expect(response.status).toBe(404);
    });
  });
});
