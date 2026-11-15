import { beforeAll, describe, expect, it } from "vitest";
import {
  createConfirmedUser,
  type LocalUser,
  localUsersConfigFromEnv,
} from "../../../__tests__/support/local-users";
import { createApp } from "../../../app";
import { type ListLine, type SyncListRequest, SyncListResponseSchema } from "../../../contracts";
import { createLogger } from "../../../lib/logger";
import { createSupabaseServices } from "../../../services";

// Roda contra o Supabase LOCAL (`pnpm db:start`) com RLS real. Ignorado sem as variáveis:
//   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY e a chave admin local (ver `local-users.ts`)
// Cria duas contas descartáveis (já confirmadas) por execução. Usa produtos do seed.
const supabaseUrl = process.env["SUPABASE_TEST_URL"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const usersConfig = localUsersConfigFromEnv();

describe.skipIf(!supabaseUrl || !anonKey || !usersConfig)(
  "lista de compras na conta contra o Supabase local",
  { timeout: 30_000 },
  () => {
    let app: ReturnType<typeof createApp>;
    let ana: LocalUser;
    let beto: LocalUser;
    const products: string[] = [];

    /** Um "aparelho": o que ele guarda entre uma sincronização e outra. */
    interface Device {
      items: ListLine[];
      baseUpdatedAt: string | null;
      dirty: boolean;
      ownerId: string | null;
    }
    const freshDevice = (): Device => ({
      items: [],
      baseUpdatedAt: null,
      dirty: false,
      ownerId: null,
    });

    async function sync(user: LocalUser | null, device: Device) {
      const body: SyncListRequest = {
        items: device.items,
        baseUpdatedAt: device.baseUpdatedAt,
        dirty: device.dirty,
        localOwnerId: device.ownerId,
      };
      const response = await app.request("/v1/me/list/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (response.status !== 200) return { status: response.status, list: null };
      const list = SyncListResponseSchema.parse(await response.json());
      // o aparelho passa a espelhar a resposta, como faz o app
      device.items = list.items.map(({ productId, quantity }) => ({ productId, quantity }));
      device.baseUpdatedAt = list.updatedAt;
      device.ownerId = list.ownerId;
      device.dirty = false;
      return { status: 200, list };
    }

    const ids = (items: readonly ListLine[]) => items.map((item) => item.productId).sort();
    const line = (index: number, quantity = 1): ListLine => ({
      productId: products[index] ?? "",
      quantity,
    });

    beforeAll(async () => {
      if (!usersConfig) return;
      app = createApp({
        services: createSupabaseServices({
          supabaseUrl: String(supabaseUrl),
          supabaseAnonKey: String(anonKey),
        }),
        logger: createLogger("silent", "api"),
      });
      ana = await createConfirmedUser(usersConfig, "lista-ana");
      beto = await createConfirmedUser(usersConfig, "lista-beto");
      // 4 produtos distintos do seed (uma busca só pode devolver poucos)
      for (const term of ["arroz", "feijao", "leite", "cafe", "oleo", "acucar"]) {
        const search = await app.request(`/v1/products/search?q=${term}&pageSize=10`);
        const body = (await search.json()) as { hits: { productId: string }[] };
        for (const hit of body.hits) {
          if (!products.includes(hit.productId) && products.length < 4) {
            products.push(hit.productId);
          }
        }
      }
      expect(products.length).toBe(4);
    });

    it("exige login", async () => {
      expect((await sync(null, freshDevice())).status).toBe(401);
    });

    it("conta nova sem lista no servidor: a lista montada sem login vira a da conta", async () => {
      const phone = freshDevice();
      phone.items = [line(0, 2), line(1)];
      phone.dirty = true;
      const result = await sync(ana, phone);
      expect(result.list?.ownerId).toBe(ana.id);
      expect(result.list?.updatedAt).not.toBeNull();
      expect(result.list?.items).toEqual([
        expect.objectContaining({ productId: products[0], quantity: 2, name: expect.any(String) }),
        expect.objectContaining({ productId: products[1], quantity: 1 }),
      ]);
      expect(result.list?.items[0]?.name.length).toBeGreaterThan(0);
    });

    it("outro aparelho da mesma conta recebe a lista, na mesma ordem", async () => {
      const laptop = freshDevice();
      const result = await sync(ana, laptop);
      expect(result.list?.items.map((item) => item.productId)).toEqual([products[0], products[1]]);
      expect(laptop.ownerId).toBe(ana.id);
    });

    it("edição num aparelho (mudar quantidade e apagar) chega ao outro", async () => {
      const phone = freshDevice();
      await sync(ana, phone); // o celular se atualiza
      phone.items = [line(0, 5)]; // mudou a quantidade e apagou o segundo item
      phone.dirty = true;
      await sync(ana, phone);

      const laptop = freshDevice();
      laptop.ownerId = ana.id; // já sincronizou antes; sem alterações
      const result = await sync(ana, laptop);
      expect(result.list?.items.map((item) => [item.productId, item.quantity])).toEqual([
        [products[0], 5],
      ]);
    });

    it("limpar a lista também sincroniza (não ressuscita os itens)", async () => {
      const phone = freshDevice();
      await sync(ana, phone);
      phone.items = [];
      phone.dirty = true;
      const cleared = await sync(ana, phone);
      expect(cleared.list?.items).toEqual([]);
      const laptop = freshDevice();
      expect((await sync(ana, laptop)).list?.items).toEqual([]);
    });

    it("dois aparelhos editando a partir da mesma versão: nada se perde", async () => {
      const phone = freshDevice();
      const laptop = freshDevice();
      phone.items = [line(0)];
      phone.dirty = true;
      await sync(ana, phone); // celular grava A
      await sync(ana, laptop); // notebook vê A

      phone.items = [line(0), line(2)];
      phone.dirty = true;
      laptop.items = [line(0), line(3)];
      laptop.dirty = true;
      await sync(ana, phone); // celular grava A + C (servidor muda)
      const merged = await sync(ana, laptop); // notebook estava na versão antiga: une
      expect(ids(merged.list?.items ?? [])).toEqual(ids([line(0), line(2), line(3)]));
      // o celular, ao sincronizar de novo, recebe a união
      const caught = await sync(ana, phone);
      expect(ids(caught.list?.items ?? [])).toEqual(ids([line(0), line(2), line(3)]));
    });

    it("outra conta nunca vê a lista da primeira e não herda a do aparelho", async () => {
      const shared = freshDevice();
      shared.items = [line(1), line(2)];
      shared.dirty = true;
      shared.ownerId = ana.id; // este aparelho era da Ana
      const asBeto = await sync(beto, shared);
      expect(asBeto.list?.items).toEqual([]); // Beto não herda a lista da Ana
      expect(asBeto.list?.ownerId).toBe(beto.id);
      expect(shared.items).toEqual([]);

      // e a lista da Ana continua intacta
      const ana2 = await sync(ana, freshDevice());
      expect(ana2.list?.items.length).toBe(3);
    });
  },
);
