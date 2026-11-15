import { describe, expect, it, vi } from "vitest";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import { createAdminService } from "../service/admin.service";

type Outcome = { count?: number | null; error?: { message: string; code?: string } | null };

/**
 * Cliente falso do Supabase: qualquer encadeamento (`from().select().eq()...`) termina no resultado
 * pedido para a tabela, como o PostgREST faria; `rpc` e `insert` têm resultado próprio.
 */
function fakeDb(options: { tables?: Record<string, Outcome>; insert?: Outcome; rpc?: Outcome }): {
  db: Db;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: options.rpc?.error ?? null });
  const chain = (outcome: Outcome) => {
    const proxy: unknown = new Proxy(() => undefined, {
      get: (_target, property) =>
        property === "then"
          ? (resolve: (value: unknown) => void) =>
              resolve({ data: [], count: outcome.count ?? 0, error: outcome.error ?? null })
          : () => proxy,
    });
    return proxy;
  };
  const db = {
    from: (table: string) => ({
      ...(chain(options.tables?.[table] ?? {}) as object),
      insert: () => Promise.resolve({ error: options.insert?.error ?? null }),
      select: () => chain(options.tables?.[table] ?? {}),
    }),
    rpc,
  } as unknown as Db;
  return { db, rpc };
}

const manualPrice = {
  storeId: "5e8f4f1c-1b1a-4c8a-9b0e-7b1f0a9d3c01",
  productId: "6f1b1b0e-5b0e-4b7a-9d57-2d6f6c2a7e11",
  priceCents: 599,
  promo: false,
};
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

describe("admin.service · preço manual", () => {
  it("publica e atualiza current_prices", async () => {
    const { db, rpc } = fakeDb({});
    await createAdminService(db).createManualPrice(manualPrice, ADMIN_ID);
    expect(rpc).toHaveBeenCalledWith("refresh_current_prices");
  });

  it("falha (em vez de responder sucesso) se o refresh de current_prices falhar", async () => {
    const { db } = fakeDb({ rpc: { error: { message: "canceling statement due to timeout" } } });
    await expect(
      createAdminService(db).createManualPrice(manualPrice, ADMIN_ID),
    ).rejects.toBeInstanceOf(DbError);
  });

  it("falha se a inserção falhar, sem tentar o refresh", async () => {
    const { db, rpc } = fakeDb({ insert: { error: { message: "violação", code: "23514" } } });
    await expect(
      createAdminService(db).createManualPrice(manualPrice, ADMIN_ID),
    ).rejects.toBeInstanceOf(DbError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("admin.service · visão geral", () => {
  it("soma as contagens", async () => {
    const { db } = fakeDb({ tables: { stores: { count: 4 }, products: { count: 9 } } });
    const overview = await createAdminService(db).getOverview();
    expect(overview).toMatchObject({ activeStores: 4, activeProducts: 9 });
  });

  it("propaga a falha do banco em vez de mostrar tudo zerado", async () => {
    const { db } = fakeDb({ tables: { stores: { error: { message: "banco fora do ar" } } } });
    await expect(createAdminService(db).getOverview()).rejects.toBeInstanceOf(DbError);
  });
});
