import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createConfirmedUser,
  localUsersConfigFromEnv,
} from "../../../__tests__/support/local-users";
import { createApp } from "../../../app";
import {
  MyContributionsResponseSchema,
  ProductDetailsSchema,
  ReviewQueueResponseSchema,
  SearchProductsResponseSchema,
  StoresResponseSchema,
} from "../../../contracts";
import { createLogger } from "../../../lib/logger";
import { createSupabaseServices } from "../../../services";
import { buildJpeg, containsText, SOS_HEADER, segment, text } from "./jpeg-fixtures";

// Roda contra o Supabase LOCAL (`pnpm db:start`) com RLS e Storage reais. Ignorado sem as variáveis:
//   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, a chave admin local (cria usuários já confirmados;
//   ver `local-users.ts`), SUPABASE_TEST_ADMIN_EMAIL, SUPABASE_TEST_ADMIN_PASSWORD
// ATENÇÃO: este teste ESCREVE. Cria dois usuários descartáveis e um envio (rejeitado no fim, para
// não mexer em preço público). Observações são imutáveis, então os registros ficam no banco local;
// nunca aponte para staging/produção.
const supabaseUrl = process.env["SUPABASE_TEST_URL"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const usersConfig = localUsersConfigFromEnv();
const adminEmail = process.env["SUPABASE_TEST_ADMIN_EMAIL"];
const adminPassword = process.env["SUPABASE_TEST_ADMIN_PASSWORD"];

describe.skipIf(!supabaseUrl || !anonKey || !usersConfig || !adminEmail || !adminPassword)(
  "contribuição de preço com foto contra o Supabase local",
  // rede real: a primeira chamada ao Storage depois de um tempo parado leva alguns segundos
  { timeout: 30_000 },
  () => {
    const url = String(supabaseUrl);
    const key = String(anonKey);
    // O corpo do describe roda mesmo quando ignorado: o app só é montado (em beforeAll) com variáveis.
    let app: ReturnType<typeof createApp>;

    const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    let tokenA = "";
    let tokenB = "";
    let tokenAdmin = "";
    let storeId = "";
    let productId = "";
    let observationId = "";
    let objectPath = "";

    /** Foto única por execução (hash novo), com EXIF/GPS e carga depois do fim para provar a limpeza. */
    const exifMarker = `GPSLatitude=-29.17;Dono=${runId}`;
    const trailing = "<?php carga-escondida ?>";
    const uniqueScan = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b % 200);
    const originalPhoto = Uint8Array.from([
      ...buildJpeg({
        prefix: segment(0xe1, [...text("Exif\0\0"), ...text(exifMarker)]),
        scan: [...SOS_HEADER, ...uniqueScan],
      }),
      ...text(trailing),
    ]);

    const authedClient = (token: string) =>
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

    async function signUp(label: string): Promise<string> {
      const user = await createConfirmedUser(
        usersConfig ?? { url, anonKey: key, serviceRoleKey: "" },
        `contrib-${label}-${runId}`,
      );
      return user.accessToken;
    }

    function form(overrides: Record<string, string> = {}, photo: Uint8Array = originalPhoto) {
      const body = new FormData();
      body.set("storeId", overrides["storeId"] ?? storeId);
      body.set("productId", overrides["productId"] ?? productId);
      body.set("priceCents", overrides["priceCents"] ?? "599");
      body.set("promo", overrides["promo"] ?? "false");
      body.set(
        "photo",
        new File([photo as Uint8Array<ArrayBuffer>], "etiqueta.jpg", { type: "image/jpeg" }),
      );
      return body;
    }

    const post = (token: string, body: FormData) =>
      app.request("/v1/contributions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body,
      });
    const get = (path: string, token?: string) =>
      app.request(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });

    beforeAll(async () => {
      app = createApp({
        services: createSupabaseServices({ supabaseUrl: url, supabaseAnonKey: key }),
        logger: createLogger("silent", "api"),
      });
      [tokenA, tokenB] = await Promise.all([signUp("a"), signUp("b")]);
      const adminClient = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await adminClient.auth.signInWithPassword({
        email: String(adminEmail),
        password: String(adminPassword),
      });
      if (error || !data.session) throw new Error(`login do admin falhou: ${error?.message}`);
      tokenAdmin = data.session.access_token;

      const stores = StoresResponseSchema.parse(await (await get("/v1/stores")).json()).stores;
      const hits = SearchProductsResponseSchema.parse(
        await (await get("/v1/products/search?q=arroz")).json(),
      ).hits;
      storeId = stores[0]?.id ?? "";
      productId = hits[0]?.productId ?? "";
      expect(storeId).not.toBe("");
      expect(productId).not.toBe("");
    });

    it("exige login", async () => {
      const response = await app.request("/v1/contributions", { method: "POST", body: form() });
      expect(response.status).toBe(401);
    });

    it("usuário comum envia preço com foto e o envio nasce pendente", async () => {
      const response = await post(tokenA, form());
      expect(response.status).toBe(201);
      const created = (await response.json()) as { id: string; status: string };
      expect(created.status).toBe("pending");
      observationId = created.id;

      const mine = MyContributionsResponseSchema.parse(
        await (await get("/v1/me/contributions", tokenA)).json(),
      );
      expect(mine.contributions.find((c) => c.id === observationId)).toMatchObject({
        status: "pending",
        priceCents: 599,
        promo: false,
      });
    });

    it("o preço enviado NÃO aparece para o público enquanto estiver pendente", async () => {
      const details = ProductDetailsSchema.parse(
        await (await get(`/v1/products/${productId}`)).json(),
      );
      const leaked = details.prices.find(
        (price) => price.storeId === storeId && price.priceCents === 599 && price.ageDays === 0,
      );
      // se o seed já tivesse exatamente R$ 5,99 hoje nesse mercado, não dá para concluir: ignora
      const seededSame = details.history.some(
        (point) => point.storeId === storeId && point.priceCents === 599,
      );
      if (!seededSame) expect(leaked).toBeUndefined();
    });

    it("cada usuário vê só os próprios envios", async () => {
      const mineB = MyContributionsResponseSchema.parse(
        await (await get("/v1/me/contributions", tokenB)).json(),
      );
      expect(mineB.contributions.some((c) => c.id === observationId)).toBe(false);
    });

    it("recusa a mesma foto reenviada (pelo mesmo usuário e por outro) sem criar envio", async () => {
      const again = await post(tokenA, form());
      expect(again.status).toBe(409);
      expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
        "duplicate_photo",
      );

      const stolen = await post(tokenB, form());
      expect(stolen.status).toBe(409);
      const mineB = MyContributionsResponseSchema.parse(
        await (await get("/v1/me/contributions", tokenB)).json(),
      );
      expect(mineB.total).toBe(0);
    });

    it("recusa arquivo que não é JPEG, produto inexistente e preço absurdo", async () => {
      const notJpeg = await post(tokenB, form({}, Uint8Array.from(text("<html>oi</html>"))));
      expect(notJpeg.status).toBe(400);
      expect(((await notJpeg.json()) as { error: { code: string } }).error.code).toBe(
        "invalid_photo",
      );

      const freshPhoto = Uint8Array.from(
        buildJpeg({
          scan: [
            ...SOS_HEADER,
            ...Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b % 200),
          ],
        }),
      );
      const unknownProduct = await post(
        tokenB,
        form({ productId: "00000000-0000-4000-8000-000000000000" }, freshPhoto),
      );
      expect(unknownProduct.status).toBe(400);
      expect(((await unknownProduct.json()) as { error: { code: string } }).error.code).toBe(
        "invalid_target",
      );

      expect((await post(tokenB, form({ priceCents: "99999999" }, freshPhoto))).status).toBe(400);
    });

    it("usuário comum não acessa a fila, a foto nem o painel do admin", async () => {
      expect((await get("/v1/admin/review-queue", tokenA)).status).toBe(403);
      expect((await get(`/v1/admin/observations/${observationId}/photo`, tokenA)).status).toBe(403);
      expect((await get(`/v1/admin/observations/${observationId}/photo`)).status).toBe(401);
    });

    it("o admin vê o envio na fila e recebe a foto SEM metadados nem carga escondida", async () => {
      const queue = ReviewQueueResponseSchema.parse(
        await (await get("/v1/admin/review-queue?pageSize=50", tokenAdmin)).json(),
      );
      // a fila é paginada e ordenada do mais antigo: procura nas páginas até achar
      let found = queue.observations.find((o) => o.id === observationId);
      for (let page = 2; !found && (page - 1) * queue.pageSize < queue.total; page++) {
        const next = ReviewQueueResponseSchema.parse(
          await (await get(`/v1/admin/review-queue?pageSize=50&page=${page}`, tokenAdmin)).json(),
        );
        found = next.observations.find((o) => o.id === observationId);
      }
      expect(found).toMatchObject({ hasPhoto: true, priceCents: 599, source: "label_photo" });

      const photo = await get(`/v1/admin/observations/${observationId}/photo`, tokenAdmin);
      expect(photo.status).toBe(200);
      expect(photo.headers.get("content-type")).toBe("image/jpeg");
      expect(photo.headers.get("cache-control")).toBe("private, no-store");
      const stored = new Uint8Array(await photo.arrayBuffer());
      expect([stored[0], stored[1]]).toEqual([0xff, 0xd8]);
      expect(containsText(stored, "GPSLatitude")).toBe(false);
      expect(containsText(stored, runId)).toBe(false);
      expect(containsText(stored, "carga-escondida")).toBe(false);
      expect(stored.length).toBeLessThan(originalPhoto.length);
    });

    it("Storage: o dono e a comunidade logada leem a foto; anônimo não lê e ninguém a altera", async () => {
      const { data: sources, error } = await authedClient(tokenA)
        .from("sources")
        .select("file_path")
        .limit(5);
      expect(error).toBeNull();
      objectPath = sources?.[0]?.file_path ?? "";
      expect(objectPath).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);

      const ownRead = await authedClient(tokenA).storage.from("contributions").download(objectPath);
      expect(ownRead.error).toBeNull();

      // ADR-0010: enquanto a publicação aparece no feed, qualquer pessoa logada lê a foto
      // (a política `contributions_community_select`); a foto de um envio fora do feed segue privada.
      expect(
        (await authedClient(tokenB).storage.from("contributions").download(objectPath)).error,
      ).toBeNull();
      const anonymous = createClient(url, key, { auth: { persistSession: false } });
      expect(
        (await anonymous.storage.from("contributions").download(objectPath)).error,
      ).not.toBeNull();

      // sem política de DELETE/UPDATE: o dono não apaga nem troca o comprovante
      await authedClient(tokenA).storage.from("contributions").remove([objectPath]);
      const stillThere = await authedClient(tokenA)
        .storage.from("contributions")
        .download(objectPath);
      expect(stillThere.error).toBeNull();
      const overwrite = await authedClient(tokenA)
        .storage.from("contributions")
        .upload(objectPath, new Uint8Array([1, 2, 3]), { upsert: true, contentType: "image/jpeg" });
      expect(overwrite.error).not.toBeNull();

      // e não grava na pasta de outro usuário
      const foreignPath = `${objectPath.split("/")[0]?.replace(/.$/, "0")}/invasao.jpg`;
      const foreign = await authedClient(tokenB)
        .storage.from("contributions")
        .upload(foreignPath, originalPhoto, { contentType: "image/jpeg" });
      expect(foreign.error).not.toBeNull();
    });

    it("pelo banco, usuário comum não aprova o próprio envio nem publica sem foto", async () => {
      const selfApprove = await authedClient(tokenA)
        .from("price_observations")
        .update({ status: "approved" })
        .eq("id", observationId)
        .select("id");
      expect(selfApprove.error).toBeNull(); // a RLS filtra a linha, não é erro de sintaxe
      expect(selfApprove.data ?? []).toHaveLength(0);

      const userB = await authedClient(tokenB).auth.getUser(tokenB);
      expect(userB.data.user?.id).toMatch(/^[0-9a-f-]{36}$/);
      const noPhoto = await authedClient(tokenB)
        .from("price_observations")
        .insert({
          store_id: storeId,
          product_id: productId,
          price_cents: 1,
          unit_price_cents: 1,
          source: "label_photo",
          status: "pending",
          created_by: userB.data.user?.id ?? "",
        });
      // 42501 = a política de RLS recusou (não é UUID inválido nem outro erro qualquer)
      expect(noPhoto.error?.code).toBe("42501");
    });

    it("o admin rejeita o envio e o autor vê o resultado; o preço segue fora do público", async () => {
      const decision = await app.request(`/v1/admin/observations/${observationId}/review`, {
        method: "POST",
        headers: { authorization: `Bearer ${tokenAdmin}`, "content-type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
      });
      expect(decision.status).toBe(200);

      const mine = MyContributionsResponseSchema.parse(
        await (await get("/v1/me/contributions", tokenA)).json(),
      );
      expect(mine.contributions.find((c) => c.id === observationId)?.status).toBe("rejected");

      // já revisado: segunda decisão não vale
      const again = await app.request(`/v1/admin/observations/${observationId}/review`, {
        method: "POST",
        headers: { authorization: `Bearer ${tokenAdmin}`, "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      });
      expect(again.status).toBe(404);
    });
  },
);
