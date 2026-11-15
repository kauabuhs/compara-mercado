import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createConfirmedUser,
  createLocalAdminClient,
  localUsersConfigFromEnv,
} from "../../../__tests__/support/local-users";
import { createApp } from "../../../app";
import { AdminOverviewSchema, ModerationResponseSchema } from "../../../contracts";
import { createLogger } from "../../../lib/logger";
import { createSupabaseServices } from "../../../services";

// Roda contra o Supabase LOCAL (`pnpm db:start`). Fica ignorado sem as variáveis:
//   as mesmas variáveis dos demais testes de integração (ver `support/local-users.ts`, que inclui a
//   chave administrativa do Supabase local) e SUPABASE_TEST_ADMIN_EMAIL / SUPABASE_TEST_ADMIN_PASSWORD
//
// Cria um mercado e um produto descartáveis pela API do cadastro, planta dois preços aprovados com
// tarefa de moderação (como a comunidade deixaria) e decide cada um pelo painel. Ao final, rejeita
// o que sobrou, arquiva o produto e inativa o mercado.
const local = localUsersConfigFromEnv();
const supabaseUrl = local?.url;
const anonKey = local?.anonKey;
const adminEmail = process.env["SUPABASE_TEST_ADMIN_EMAIL"];
const adminPassword = process.env["SUPABASE_TEST_ADMIN_PASSWORD"];

const suffix = Math.random().toString(36).slice(2, 8);

describe.skipIf(!local || !adminEmail || !adminPassword)(
  "moderação contra o Supabase local (admin)",
  () => {
    let app: ReturnType<typeof createApp>;
    let token = "";
    let service: ReturnType<typeof createLocalAdminClient>;
    const ids = { city: "", store: "", product: "", productKeep: "", retire: "", keep: "" };
    const tasks = { retire: "", keep: "" };

    async function call(method: string, path: string, body?: unknown) {
      const response = await app.request(path, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    }

    /** O preço está publicado? Lê `current_prices` como visitante (é o que o comparador usa). */
    async function isPublished(observationId: string): Promise<boolean> {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/current_prices?observation_id=eq.${observationId}&select=observation_id`,
        { headers: { apikey: String(anonKey) } },
      );
      return ((await response.json()) as unknown[]).length === 1;
    }

    async function plantApprovedPrice(
      productId: string,
      priceCents: number,
    ): Promise<{ observation: string; task: string }> {
      const observation = await service
        .from("price_observations")
        .insert({
          store_id: ids.store,
          product_id: productId,
          price_cents: priceCents,
          unit_price_cents: 1,
          source: "label_photo",
          status: "approved",
        })
        .select("id")
        .single();
      expect(observation.error).toBeNull();
      const observationId = String(observation.data?.id);
      const task = await service
        .from("review_tasks")
        .insert({
          target_type: "price_observation",
          target_id: observationId,
          reason: "Denunciada pela comunidade",
          payload: { reports: 3 },
        })
        .select("id")
        .single();
      expect(task.error).toBeNull();
      expect((await service.rpc("refresh_current_prices")).error).toBeNull();
      return { observation: observationId, task: String(task.data?.id) };
    }

    beforeAll(async () => {
      // `describe.skipIf` não impede o corpo de rodar: só monta o cliente se houver configuração
      if (!local) return;
      service = createLocalAdminClient(local);
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

      const ibge = `98${String(Math.floor(Math.random() * 100_000)).padStart(5, "0")}`;
      const city = await call("POST", "/v1/admin/cities", {
        name: `Cidade Moderação ${suffix}`,
        uf: "RS",
        ibgeCode: ibge,
      });
      ids.city = String(city.body["id"]);
      const store = await call("POST", "/v1/admin/stores", {
        name: `Mercado Moderação ${suffix}`,
        cityId: ids.city,
        lat: -29.17,
        lng: -51.18,
      });
      ids.store = String(store.body["id"]);
      const product = await call("POST", "/v1/admin/products", {
        name: `Produto Moderação ${suffix}`,
        sizeValue: 1,
        sizeUnit: "kg",
      });
      ids.product = String(product.body["id"]);
      // `current_prices` guarda um preço por (mercado, produto): cada cenário usa o seu produto
      const productKeep = await call("POST", "/v1/admin/products", {
        name: `Produto Moderação B ${suffix}`,
        sizeValue: 1,
        sizeUnit: "kg",
      });
      ids.productKeep = String(productKeep.body["id"]);

      const retire = await plantApprovedPrice(ids.product, 1234);
      ids.retire = retire.observation;
      tasks.retire = retire.task;
      const keep = await plantApprovedPrice(ids.productKeep, 2345);
      ids.keep = keep.observation;
      tasks.keep = keep.task;
    });

    afterAll(async () => {
      if (!ids.keep) return;
      await service.from("price_observations").update({ status: "rejected" }).eq("id", ids.keep);
      await call("PATCH", `/v1/admin/products/${ids.product}`, { status: "archived" });
      await call("PATCH", `/v1/admin/products/${ids.productKeep}`, { status: "archived" });
      await call("PATCH", `/v1/admin/stores/${ids.store}`, { status: "inactive" });
      await call("PATCH", `/v1/admin/cities/${ids.city}`, { active: false });
    });

    it("lista a tarefa com produto, mercado, preço e situação atual", async () => {
      const { status, body } = await call("GET", "/v1/admin/moderation?pageSize=50");
      expect(status).toBe(200);
      const queue = ModerationResponseSchema.parse(body);
      const item = queue.items.find((entry) => entry.taskId === tasks.retire);
      expect(item).toMatchObject({
        observationId: ids.retire,
        status: "approved",
        productName: `Produto Moderação ${suffix}`,
        storeName: `Mercado Moderação ${suffix}`,
        priceCents: 1234,
        reason: "Denunciada pela comunidade",
      });
      const overview = AdminOverviewSchema.parse((await call("GET", "/v1/admin/overview")).body);
      expect(overview.openModerationTasks).toBeGreaterThanOrEqual(2);
    });

    it("retira um preço já publicado: sai do comparador, guarda o motivo e encerra a tarefa", async () => {
      expect(await isPublished(ids.retire)).toBe(true);
      const decided = await call("POST", `/v1/admin/moderation/${tasks.retire}`, {
        action: "reject",
        note: "O preço não confere com a foto",
      });
      expect(decided.status).toBe(200);

      expect(await isPublished(ids.retire)).toBe(false);
      const observation = await service
        .from("price_observations")
        .select("status,review_note,reviewed_by")
        .eq("id", ids.retire)
        .single();
      expect(observation.data).toMatchObject({
        status: "rejected",
        review_note: "O preço não confere com a foto",
      });
      expect(observation.data?.reviewed_by).not.toBeNull();
      const task = await service
        .from("review_tasks")
        .select("status")
        .eq("id", tasks.retire)
        .single();
      expect(task.data?.status).toBe("resolved");

      const again = await call("POST", `/v1/admin/moderation/${tasks.retire}`, { action: "keep" });
      expect(again.status).toBe(404); // já encerrada: não vira falso sucesso
    });

    it("manter o preço encerra a tarefa e não mexe no que está publicado", async () => {
      const decided = await call("POST", `/v1/admin/moderation/${tasks.keep}`, { action: "keep" });
      expect(decided.status).toBe(200);
      expect(await isPublished(ids.keep)).toBe(true);
      const observation = await service
        .from("price_observations")
        .select("status")
        .eq("id", ids.keep)
        .single();
      expect(observation.data?.status).toBe("approved");
      const task = await service
        .from("review_tasks")
        .select("status,resolved_by")
        .eq("id", tasks.keep)
        .single();
      expect(task.data?.status).toBe("dismissed");
      expect(task.data?.resolved_by).not.toBeNull();
    });

    it("as tarefas encerradas saem da fila", async () => {
      const queue = ModerationResponseSchema.parse(
        (await call("GET", "/v1/admin/moderation?pageSize=50")).body,
      );
      const open = queue.items.map((entry) => entry.taskId);
      expect(open).not.toContain(tasks.retire);
      expect(open).not.toContain(tasks.keep);
    });

    it("a fila e as decisões exigem admin", async () => {
      const anonymous = await app.request("/v1/admin/moderation");
      expect(anonymous.status).toBe(401);
    });

    it("usuário comum logado recebe 403 na fila e nas decisões", async () => {
      if (!local) return;
      const common = await createConfirmedUser(local, "moderacao-comum");
      const headers = { authorization: `Bearer ${common.accessToken}` };
      expect((await app.request("/v1/admin/moderation", { headers })).status).toBe(403);
      const decide = await app.request(`/v1/admin/moderation/${tasks.keep}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ action: "keep" }),
      });
      expect(decide.status).toBe(403);
    });
  },
);
