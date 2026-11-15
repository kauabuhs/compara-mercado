import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createConfirmedUser,
  createLocalAdminClient,
  localUsersConfigFromEnv,
} from "../../../__tests__/support/local-users";
import { createApp } from "../../../app";
import {
  CitiesResponseSchema,
  CommunityFeedResponseSchema,
  ConfirmObservationResponseSchema,
  type FeedItem,
  ReputationSchema,
  StoresResponseSchema,
} from "../../../contracts";
import { createLogger } from "../../../lib/logger";
import { reputationLevel } from "../../../lib/reputation";
import { createSupabaseServices } from "../../../services";
import {
  buildJpeg,
  containsText,
  SOS_HEADER,
  segment,
  text,
} from "../../contributions/__tests__/jpeg-fixtures";

// Roda contra o Supabase LOCAL (`pnpm db:start`) com RLS, funções SQL e Storage reais. Ignorado sem
// as variáveis: SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY e a chave admin local (que só cria os
// usuários e o produto descartáveis; ver `local-users.ts`).
// ATENÇÃO: este teste ESCREVE. Observações são imutáveis, então os envios ficam no banco local; por
// isso usa um produto exclusivo, arquivado no fim (some do feed e das buscas). Nunca aponte para
// staging/produção.
const supabaseUrl = process.env["SUPABASE_TEST_URL"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const usersConfig = localUsersConfigFromEnv();

describe.skipIf(!supabaseUrl || !anonKey || !usersConfig)(
  "comunidade de preços contra o Supabase local",
  { timeout: 60_000 },
  () => {
    const url = String(supabaseUrl);
    const key = String(anonKey);
    const config = usersConfig ?? { url, anonKey: key, serviceRoleKey: "" };
    // O corpo do describe roda mesmo ignorado: o app só é montado (em beforeAll) com variáveis.
    let app: ReturnType<typeof createApp>;

    const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    // Criado no beforeAll: o corpo do describe roda mesmo ignorado, e sem a chave o cliente não nasce.
    let service: ReturnType<typeof createLocalAdminClient>;

    // author publica; solid (reputação >= 50) e novice confirmam; extra1/2/3 denunciam e olham.
    const users: Record<"author" | "solid" | "novice" | "extra1" | "extra2" | "extra3", string> & {
      ids: Record<string, string>;
    } = {
      author: "",
      solid: "",
      novice: "",
      extra1: "",
      extra2: "",
      extra3: "",
      ids: {},
    };
    let cityId = "";
    let storeId = "";
    let productId = "";
    let approvedId = "";
    let disputedId = "";

    const uniquePhoto = () =>
      Uint8Array.from([
        ...buildJpeg({
          prefix: segment(0xe1, [...text("Exif\0\0"), ...text(`GPSLatitude=-29.17;Dono=${runId}`)]),
          scan: [
            ...SOS_HEADER,
            ...Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b % 200),
          ],
        }),
      ]);

    const headers = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});
    const get = (path: string, token?: string) => app.request(path, { headers: headers(token) });
    const send = (path: string, token: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { ...headers(token), "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    // Leitura anônima do feed fica em cache por 15 s (por design); com sessão nunca é compartilhada.
    // As verificações de estado usam um observador logado (`null` = visitante de verdade).
    const feed = async (token?: string | null, query = "") => {
      const response = await get(`/v1/community/feed?cityId=${cityId}${query}`, token ?? undefined);
      const payload: unknown = await response.json();
      expect(response.status, JSON.stringify(payload)).toBe(200);
      return CommunityFeedResponseSchema.parse(payload);
    };
    const findInFeed = async (
      id: string,
      token: string | null = users.extra1,
    ): Promise<FeedItem | undefined> =>
      (await feed(token, "&limit=49")).items.find((item) => item.id === id);

    async function publish(token: string, priceCents: number): Promise<string> {
      const body = new FormData();
      body.set("storeId", storeId);
      body.set("productId", productId);
      body.set("priceCents", String(priceCents));
      body.set("promo", "false");
      body.set(
        "photo",
        new File([uniquePhoto() as Uint8Array<ArrayBuffer>], "etiqueta.jpg", {
          type: "image/jpeg",
        }),
      );
      const response = await app.request("/v1/contributions", {
        method: "POST",
        headers: headers(token),
        body,
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { id: string }).id;
    }

    beforeAll(async () => {
      service = createLocalAdminClient(config);
      app = createApp({
        services: createSupabaseServices({ supabaseUrl: url, supabaseAnonKey: key }),
        logger: createLogger("silent", "api"),
      });
      for (const label of ["author", "solid", "novice", "extra1", "extra2", "extra3"] as const) {
        const user = await createConfirmedUser(config, `com-${label}-${runId}`);
        users[label] = user.accessToken;
        users.ids[label] = user.id;
      }
      // "Colaborador" já estabelecido: só o service_role altera reputação.
      const raised = await service
        .from("profiles")
        .update({ reputation: 60 })
        .eq("id", users.ids["solid"] ?? "");
      expect(raised.error).toBeNull();

      const cities = CitiesResponseSchema.parse(await (await get("/v1/cities")).json()).cities;
      cityId = cities[0]?.id ?? "";
      const stores = StoresResponseSchema.parse(
        await (await get(`/v1/stores?cityId=${cityId}`)).json(),
      ).stores;
      storeId = stores[0]?.id ?? "";
      expect(cityId).not.toBe("");
      expect(storeId).not.toBe("");

      const product = await service
        .from("products")
        .insert({
          canonical_name: `Produto Teste Comunidade ${runId}`,
          size_value: 1,
          size_unit: "kg",
          status: "active",
        })
        .select("id")
        .single();
      expect(product.error).toBeNull();
      productId = product.data?.id ?? "";
    });

    // Sempre arquiva o produto descartável, mesmo se um caso falhar ou se rodar só um (`-t`): as
    // observações são imutáveis e ficariam poluindo o feed do banco local de desenvolvimento.
    afterAll(async () => {
      if (productId)
        await service.from("products").update({ status: "archived" }).eq("id", productId);
    });

    it("o feed é público e o envio de preço aparece como 'aguardando confirmação'", async () => {
      approvedId = await publish(users.author, 700);

      const anonymous = await findInFeed(approvedId, null);
      expect(anonymous).toMatchObject({
        priceCents: 700,
        trust: "unconfirmed",
        origin: "community",
        confirmCount: 0,
        hasPhoto: true,
        isMine: false,
        myVerdict: null,
        store: { id: storeId },
      });
      // identidade: só o apelido padrão, nunca e-mail, nome ou id
      expect(anonymous?.author.label).toMatch(/^Colaborador #[0-9A-F]{4}$/);
      expect(anonymous?.author.level).toBe(0);
      expect(JSON.stringify(anonymous)).not.toContain(users.ids["author"] ?? "xx");
      expect(JSON.stringify(anonymous)).not.toContain("@test.local");

      expect((await findInFeed(approvedId, users.author))?.isMine).toBe(true);
    });

    it("não se confirma a própria publicação, e votar duas vezes é recusado", async () => {
      const own = await send(
        `/v1/community/observations/${approvedId}/confirmations`,
        users.author,
        {
          verdict: "confirm",
        },
      );
      expect(own.status).toBe(403);
      expect(((await own.json()) as { error: { code: string } }).error.code).toBe(
        "own_observation",
      );

      const first = await send(
        `/v1/community/observations/${approvedId}/confirmations`,
        users.solid,
        {
          verdict: "confirm",
        },
      );
      expect(first.status).toBe(200);
      expect(ConfirmObservationResponseSchema.parse(await first.json())).toEqual({
        status: "pending",
        confirmCount: 1,
        changedCount: 0,
      });

      const again = await send(
        `/v1/community/observations/${approvedId}/confirmations`,
        users.solid,
        {
          verdict: "confirm",
        },
      );
      expect(again.status).toBe(409);
      expect(((await again.json()) as { error: { code: string } }).error.code).toBe("already_done");

      expect((await findInFeed(approvedId, users.solid))?.myVerdict).toBe("confirm");
    });

    it("a segunda confirmação (de pessoa diferente) aprova e a tela passa a mostrar 'confirmado'", async () => {
      const second = await send(
        `/v1/community/observations/${approvedId}/confirmations`,
        users.novice,
        {
          verdict: "confirm",
        },
      );
      expect(second.status).toBe(200);
      expect(ConfirmObservationResponseSchema.parse(await second.json())).toMatchObject({
        status: "approved",
        confirmCount: 2,
      });
      expect(await findInFeed(approvedId)).toMatchObject({ trust: "confirmed", confirmCount: 2 });
    });

    it("o autor ganha pontos e vê o histórico na própria reputação", async () => {
      const response = await get("/v1/me/reputation", users.author);
      expect(response.status).toBe(200);
      const reputation = ReputationSchema.parse(await response.json());
      // +2 +2 (confirmações recebidas) +10 (preço aprovado)
      expect(reputation.points).toBe(14);
      expect(reputation).toMatchObject({ level: 0, nextLevelAt: 50 });
      expect(reputation.events.map((event) => event.kind).sort()).toEqual([
        "confirmation_received",
        "confirmation_received",
        "price_approved",
      ]);
      expect((await get("/v1/me/reputation")).status).toBe(401);
    });

    it("quem está logado vê a foto sem metadados; visitante não", async () => {
      const response = await get(`/v1/community/observations/${approvedId}/photo`, users.extra1);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      expect(containsText(bytes, "GPSLatitude")).toBe(false);

      expect((await get(`/v1/community/observations/${approvedId}/photo`)).status).toBe(401);
    });

    it("três denúncias de pessoas diferentes escondem a publicação e a foto", async () => {
      disputedId = await publish(users.author, 710);
      expect(await findInFeed(disputedId)).toBeDefined();

      for (const reporter of [users.extra1, users.extra2, users.extra3]) {
        const response = await send(`/v1/community/observations/${disputedId}/reports`, reporter, {
          reason: "wrong_price",
        });
        expect(response.status).toBe(201);
      }
      const duplicate = await send(
        `/v1/community/observations/${disputedId}/reports`,
        users.extra1,
        {
          reason: "spam",
        },
      );
      expect(duplicate.status).toBe(409);

      expect(await findInFeed(disputedId)).toBeUndefined();
      expect(
        (await get(`/v1/community/observations/${disputedId}/photo`, users.solid)).status,
      ).toBe(404);
    });

    it("pagina por cursor sem repetir itens", async () => {
      const first = await feed(undefined, "&limit=1");
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();
      const second = await feed(undefined, `&limit=1&cursor=${first.nextCursor}`);
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);

      const invalid = await get(`/v1/community/feed?cityId=${cityId}&cursor=lixo`);
      expect(invalid.status).toBe(400);
    });

    it("o filtro de raio e a distância usam a posição da consulta, que não é gravada", async () => {
      const store = StoresResponseSchema.parse(
        await (await get(`/v1/stores?cityId=${cityId}`)).json(),
      ).stores.find((candidate) => candidate.id === storeId);
      const near = await feed(
        undefined,
        `&lat=${store?.lat}&lng=${store?.lng}&radiusM=500&limit=49`,
      );
      const item = near.items.find((candidate) => candidate.id === approvedId);
      expect(item?.distanceM).not.toBeNull();
      expect(item?.distanceM ?? 9999).toBeLessThan(50);

      const far = await feed(undefined, "&lat=-30.5&lng=-52.5&radiusM=500&limit=49");
      expect(far.items.find((candidate) => candidate.id === approvedId)).toBeUndefined();
    });

    it("as faixas de reputação do TypeScript batem com as do banco", async () => {
      const anon = createClient(url, key, { auth: { persistSession: false } });
      for (const points of [0, 1, 49, 50, 199, 200, 599, 600, 5000]) {
        const { data, error } = await anon.rpc("reputation_level", { p_reputation: points });
        expect(error).toBeNull();
        expect(data).toBe(reputationLevel(points));
      }
    });

    it("usuário comum não grava confirmação nem reputação direto no banco", async () => {
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${users.extra2}` } },
      });
      const insert = await client.from("observation_confirmations").insert({
        observation_id: approvedId,
        user_id: users.ids["extra2"] ?? "",
        verdict: "confirm",
      });
      expect(insert.error?.code).toBe("42501");
      const raise = await client
        .from("profiles")
        .update({ reputation: 9999 })
        .eq("id", users.ids["extra2"] ?? "");
      expect(raise.error?.code).toBe("42501");
    });

    it("arquivar o produto de teste tira as publicações do feed", async () => {
      const archived = await service
        .from("products")
        .update({ status: "archived" })
        .eq("id", productId);
      expect(archived.error).toBeNull();
      expect(await findInFeed(approvedId)).toBeUndefined();
    });
  },
);
