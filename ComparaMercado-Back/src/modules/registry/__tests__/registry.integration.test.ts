import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../app";
import { isValidGtin } from "../../../lib/gtin";
import { createLogger } from "../../../lib/logger";
import { createSupabaseServices } from "../../../services";

// Roda contra o Supabase LOCAL (`pnpm db:start`). Fica ignorado sem as variáveis:
//   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_ADMIN_EMAIL, SUPABASE_TEST_ADMIN_PASSWORD
//
// Cria dados de verdade pela API, como um admin faria. Nada é apagado (o cadastro-base não tem
// DELETE): cada execução usa um sufixo único e deixa a cidade desativada, o mercado inativo e o
// produto arquivado. As duas categorias (que não têm situação) ficam com o prefixo "zz-teste-".
const supabaseUrl = process.env["SUPABASE_TEST_URL"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const adminEmail = process.env["SUPABASE_TEST_ADMIN_EMAIL"];
const adminPassword = process.env["SUPABASE_TEST_ADMIN_PASSWORD"];

const suffix = Math.random().toString(36).slice(2, 8);

/** 13 dígitos válidos: 12 aleatórios + dígito verificador. */
function randomGtin(): string {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  for (let check = 0; check < 10; check++) {
    const candidate = `${base}${check}`;
    if (isValidGtin(candidate)) return candidate;
  }
  throw new Error("não achou dígito verificador");
}

describe.skipIf(!supabaseUrl || !anonKey || !adminEmail || !adminPassword)(
  "cadastro-base contra o Supabase local (admin)",
  () => {
    let app: ReturnType<typeof createApp>;
    let token = "";

    beforeAll(async () => {
      app = createApp({
        services: createSupabaseServices({
          supabaseUrl: String(supabaseUrl),
          supabaseAnonKey: String(anonKey),
        }),
        logger: createLogger("silent", "api"),
      });
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: String(anonKey), "content-type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      token = ((await response.json()) as { access_token: string }).access_token;
    });

    // Sem DELETE no cadastro: deixa o que criou desabilitado. A cidade habilitada que sobra faria
    // outras telas (e o e2e) enxergarem mais de uma cidade coberta.
    afterAll(async () => {
      if (!token) return;
      if (ids.store) await call("PATCH", `/v1/admin/stores/${ids.store}`, { status: "inactive" });
      if (ids.city) await call("PATCH", `/v1/admin/cities/${ids.city}`, { active: false });
    });

    async function call(method: string, path: string, body?: unknown, asAdmin = true) {
      const response = await app.request(path, {
        method,
        headers: {
          ...(asAdmin ? { authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    }

    /** O visitante (anon) enxerga a linha? Direto no PostgREST: a API pública tem cache em memória. */
    async function visibleToPublic(table: string, id: string): Promise<boolean> {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}&select=id`, {
        headers: { apikey: String(anonKey) },
      });
      return ((await response.json()) as unknown[]).length === 1;
    }

    const ibgeCode = `99${String(Math.floor(Math.random() * 100_000)).padStart(5, "0")}`;
    const ids: { city: string; store: string; parent: string; child: string; product: string } = {
      city: "",
      store: "",
      parent: "",
      child: "",
      product: "",
    };

    it("cidade: cria desativada, recusa IBGE repetido, edita e ativa", async () => {
      const created = await call("POST", "/v1/admin/cities", {
        name: `Cidade Teste ${suffix}`,
        uf: "rs",
        ibgeCode,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ uf: "RS", ibgeCode, active: false });
      ids.city = String(created.body["id"]);

      const duplicate = await call("POST", "/v1/admin/cities", {
        name: "Outra",
        uf: "RS",
        ibgeCode,
      });
      expect(duplicate.status).toBe(409);

      const renamed = await call("PATCH", `/v1/admin/cities/${ids.city}`, {
        name: `Cidade Renomeada ${suffix}`,
        active: true,
      });
      expect(renamed.status).toBe(200);
      expect(renamed.body).toMatchObject({ name: `Cidade Renomeada ${suffix}`, active: true });

      const listed = await call("GET", `/v1/admin/cities?q=Renomeada ${suffix}`);
      expect(listed.body["total"]).toBe(1);
    });

    it("a biblioteca é pública; só a cidade habilitada entra no comparador (ADR-0014)", async () => {
      // O público sempre enxerga a cidade (biblioteca de municípios); `active` decide se ela
      // aparece como habilitada. O teste anterior a ativou ao editar.
      const enabledForPublic = async (): Promise<boolean> => {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/cities?id=eq.${ids.city}&active=eq.true&select=id`,
          { headers: { apikey: String(anonKey) } },
        );
        return ((await response.json()) as unknown[]).length === 1;
      };
      await call("PATCH", `/v1/admin/cities/${ids.city}`, { active: false });
      expect(await visibleToPublic("cities", ids.city)).toBe(true);
      expect(await enabledForPublic()).toBe(false);
      await call("PATCH", `/v1/admin/cities/${ids.city}`, { active: true });
      expect(await enabledForPublic()).toBe(true);
      await call("PATCH", `/v1/admin/cities/${ids.city}`, { active: false });
      expect(await enabledForPublic()).toBe(false);
    });

    it("mercado: cria com coordenadas, recusa cidade inexistente, move e inativa", async () => {
      const created = await call("POST", "/v1/admin/stores", {
        name: `Mercado Teste ${suffix}`,
        cityId: ids.city,
        neighborhood: "Centro",
        lat: -29.17,
        lng: -51.18,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        status: "active",
        cityName: `Cidade Renomeada ${suffix}`,
      });
      expect(created.body["lat"] as number).toBeCloseTo(-29.17, 4);
      expect(created.body["lng"] as number).toBeCloseTo(-51.18, 4);
      ids.store = String(created.body["id"]);

      const orphan = await call("POST", "/v1/admin/stores", {
        name: "Sem cidade",
        cityId: "00000000-0000-4000-8000-000000000000",
        lat: -29,
        lng: -51,
      });
      expect(orphan.status).toBe(400);

      const moved = await call("PATCH", `/v1/admin/stores/${ids.store}`, {
        lat: -29.2,
        lng: -51.2,
        status: "inactive",
      });
      expect(moved.status).toBe(200);
      expect(moved.body["lat"] as number).toBeCloseTo(-29.2, 4);
      expect(moved.body["status"]).toBe("inactive");

      const inactive = await call("GET", `/v1/admin/stores?situation=inactive&q=${suffix}`);
      expect(inactive.body["total"]).toBe(1);
      const active = await call("GET", `/v1/admin/stores?situation=active&q=${suffix}`);
      expect(active.body["total"]).toBe(0);
    });

    it("categoria: cria pai e filha, recusa slug repetido e ciclo", async () => {
      const parent = await call("POST", "/v1/admin/categories", {
        name: `zz-teste-pai ${suffix}`,
        slug: `zz-teste-pai-${suffix}`,
      });
      expect(parent.status).toBe(201);
      ids.parent = String(parent.body["id"]);
      const child = await call("POST", "/v1/admin/categories", {
        name: `zz-teste-filha ${suffix}`,
        slug: `zz-teste-filha-${suffix}`,
        parentId: ids.parent,
      });
      expect(child.status).toBe(201);
      ids.child = String(child.body["id"]);

      const duplicate = await call("POST", "/v1/admin/categories", {
        name: "Repetida",
        slug: `zz-teste-pai-${suffix}`,
      });
      expect(duplicate.status).toBe(409);

      const cycle = await call("PATCH", `/v1/admin/categories/${ids.parent}`, {
        parentId: ids.child,
      });
      expect(cycle.status).toBe(400);
      expect((cycle.body["error"] as { code: string }).code).toBe("invalid_parent");
    });

    it("produto: cria com marca e categoria, confere GTIN, edita, troca categoria e arquiva", async () => {
      const gtin = randomGtin();
      const created = await call("POST", "/v1/admin/products", {
        name: `Produto Teste ${suffix}`,
        brand: `Marca Teste ${suffix}`,
        categoryId: ids.parent,
        gtin,
        sizeValue: 500,
        sizeUnit: "g",
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        brand: `Marca Teste ${suffix}`,
        categoryId: ids.parent,
        gtin,
        sizeValue: 500,
        sizeUnit: "g",
        status: "active",
      });
      ids.product = String(created.body["id"]);

      const wrongDigit = `${gtin.slice(0, 12)}${(Number(gtin[12]) + 1) % 10}`;
      const invalid = await call("POST", "/v1/admin/products", {
        name: "GTIN ruim",
        gtin: wrongDigit,
        sizeValue: 1,
        sizeUnit: "un",
      });
      expect(invalid.status).toBe(400);
      expect((invalid.body["error"] as { code: string }).code).toBe("invalid_gtin");

      const duplicate = await call("POST", "/v1/admin/products", {
        name: "Mesmo código",
        gtin,
        sizeValue: 1,
        sizeUnit: "un",
      });
      expect(duplicate.status).toBe(409);

      const edited = await call("PATCH", `/v1/admin/products/${ids.product}`, {
        name: `Produto Editado ${suffix}`,
        sizeValue: 1,
        sizeUnit: "kg",
        categoryId: ids.child,
      });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({
        name: `Produto Editado ${suffix}`,
        sizeValue: 1,
        sizeUnit: "kg",
        categoryId: ids.child,
        brand: `Marca Teste ${suffix}`,
      });

      const byGtin = await call("GET", `/v1/admin/products?q=${gtin}`);
      expect(byGtin.body["total"]).toBe(1);

      // ativo: o público vê (RLS); arquivado: some
      expect(await visibleToPublic("products", ids.product)).toBe(true);
      const archived = await call("PATCH", `/v1/admin/products/${ids.product}`, {
        status: "archived",
      });
      expect(archived.body["status"]).toBe("archived");
      expect(await visibleToPublic("products", ids.product)).toBe(false);
    });

    it("PATCH em registro inexistente devolve 404", async () => {
      const missing = "00000000-0000-4000-8000-000000000000";
      for (const path of ["cities", "stores", "categories", "products"]) {
        const response = await call("PATCH", `/v1/admin/${path}/${missing}`, { name: "Nada" });
        expect(response.status).toBe(404);
      }
    });

    it("sem token ou como visitante o cadastro é inacessível", async () => {
      expect((await call("GET", "/v1/admin/products", undefined, false)).status).toBe(401);
      expect((await call("POST", "/v1/admin/cities", { name: "x" }, false)).status).toBe(401);
    });
  },
);
