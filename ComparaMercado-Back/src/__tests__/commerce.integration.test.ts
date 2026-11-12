/**
 * Integração contra um Postgres REAL com as migrações aplicadas (e, por isso, concorrência de
 * verdade: várias conexões em paralelo). Defina DATABASE_URL_TEST, por exemplo:
 *
 *   DATABASE_URL_TEST=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter comparamercado-back test
 *
 * Use um banco DESCARTÁVEL (`pnpm db:reset`): preços, movimentações e promoções são histórico
 * imutável e NÃO podem ser apagados, então cada execução deixa linhas com sufixo único.
 */

import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrmDb, createPool, type OrmDb } from "../database/client";
import { trackedJob } from "../jobs/job-runs";
import { isValidGtin } from "../lib/gtin";
import {
  importCatalog,
  listProductsPage,
} from "../modules/catalog/repository/catalog-import.repository";
import {
  priceVersions,
  resolvePrices,
  setProductPrice,
} from "../modules/pricing/repository/pricing.repository";
import {
  expirePromotions,
  redeemPromotion,
} from "../modules/promotions/repository/promotion.repository";
import {
  adjustStock,
  commitReservation,
  getStock,
  receiveStock,
  releaseReservation,
  reserveStock,
  transferStock,
} from "../modules/stock/repository/stock.repository";

const url = process.env["DATABASE_URL_TEST"];
const run = Math.random().toString(36).slice(2, 8);

function gtin13(): string {
  const base = String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  const code = base + String((10 - (sum % 10)) % 10);
  if (!isValidGtin(code)) throw new Error("gerador de GTIN inválido");
  return code;
}

async function rows<T extends Record<string, unknown>>(
  db: OrmDb,
  q: ReturnType<typeof sql>,
): Promise<T[]> {
  return (await db.execute<T>(q)).rows as T[];
}

describe.skipIf(!url)("persistência comercial (Drizzle) — Postgres real", () => {
  let pool: pg.Pool;
  let db: OrmDb;

  // fixtures compartilhadas
  let storeId: string;
  let marketId: string;
  let priceListId: string;
  let dc: string;

  beforeAll(async () => {
    pool = createPool(url as string, { max: 20, applicationName: "compara-it" });
    db = createOrmDb(pool);

    const ibge = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
    const [city] = await rows<{ id: string }>(
      db,
      sql`insert into public.cities (ibge_code, name, uf, active) values (${ibge}, ${`Cidade IT ${run}`}, 'RS', true) returning id`,
    );
    const [store] = await rows<{ id: string; market_id: string }>(
      db,
      sql`insert into public.stores (city_id, name, location, status)
          values (${city?.id}::uuid, ${`Loja IT ${run}`}, extensions.st_makepoint(-51.2, -29.2)::extensions.geography, 'active')
          returning id, market_id`,
    );
    storeId = store?.id as string;
    marketId = store?.market_id as string;

    const [pl] = await rows<{ id: string }>(
      db,
      sql`insert into public.price_lists (market_id, currency_code, name)
          select id, currency_code, ${`Lista IT ${run}`} from public.markets where id = ${marketId}::uuid returning id`,
    );
    priceListId = pl?.id as string;

    const [w] = await rows<{ id: string }>(
      db,
      sql`insert into public.warehouses (market_id, code, name, kind)
          values (${marketId}::uuid, ${`dc-it-${run}`}, 'CD IT', 'distribution_center') returning id`,
    );
    dc = w?.id as string;
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  /** Cria um produto por unidade e devolve o id. */
  async function newProduct(
    name: string,
    extra: { sizeValue?: number } = {},
  ): Promise<{ id: string; gtin: string }> {
    const gtin = gtin13();
    const r = await importCatalog(db, [
      { gtin, name: `${name} ${run}`, sizeValue: extra.sizeValue ?? 1, sizeUnit: "un" },
    ]);
    expect(r.inserted).toBe(1);
    const [p] = await rows<{ id: string }>(
      db,
      sql`select id from public.products where gtin = ${gtin}`,
    );
    return { id: p?.id as string, gtin };
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────
  describe("importação e listagem de catálogo", () => {
    it("importa em lote, rejeita linhas inválidas e é idempotente", async () => {
      const [g1, g2, g3] = [gtin13(), gtin13(), gtin13()];
      const batch = [
        {
          gtin: g1,
          name: `Refri ${run}`,
          brand: `Marca ${run}`,
          sizeValue: 350,
          sizeUnit: "ml" as const,
          variantLabel: "Lata",
        },
        {
          gtin: g2,
          name: `Refri ${run}`,
          brand: `Marca ${run}`,
          sizeValue: 2,
          sizeUnit: "l" as const,
          variantLabel: "Garrafa 2 L",
        },
        { gtin: g3, name: `Outro ${run}`, sizeValue: 1, sizeUnit: "kg" as const },
        { gtin: "1234567890123", name: "GTIN inválido", sizeValue: 1, sizeUnit: "un" as const },
        {
          gtin: gtin13(),
          name: "Categoria inexistente",
          categorySlug: `nao-existe-${run}`,
          sizeValue: 1,
          sizeUnit: "un" as const,
        },
      ];
      const first = await importCatalog(db, batch);
      expect(first).toMatchObject({ inserted: 3, updated: 0, unchanged: 0 });
      expect(first.rejected.map((r) => r.index)).toEqual([3, 4]);

      // as duas apresentações do refrigerante dividem UMA família
      const fam = await rows<{ n: string }>(
        db,
        sql`select count(distinct family_id)::text n from public.products where gtin in (${g1}, ${g2})`,
      );
      expect(fam[0]?.n).toBe("1");

      // reimportar o mesmo arquivo: nada muda e nenhuma família órfã nasce
      const familiesBefore = await rows<{ n: string }>(
        db,
        sql`select count(*)::text n from public.product_families`,
      );
      const second = await importCatalog(db, batch);
      expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });
      const familiesAfter = await rows<{ n: string }>(
        db,
        sql`select count(*)::text n from public.product_families`,
      );
      expect(familiesAfter[0]?.n).toBe(familiesBefore[0]?.n);

      // mudar o nome de um GTIN existente atualiza SEM criar família órfã
      const third = await importCatalog(db, [
        { ...batch[2], name: `Outro renomeado ${run}` } as (typeof batch)[number],
      ]);
      expect(third).toMatchObject({ inserted: 0, updated: 1 });
      const orphans = await rows<{ n: string }>(
        db,
        sql`select count(*)::text n from public.product_families f
            where f.name like ${`%${run}`} and not exists (select 1 from public.products p where p.family_id = f.id)`,
      );
      expect(orphans[0]?.n).toBe("0");
    }, 60_000);

    it("pagina por cursor sem repetir nem pular itens", async () => {
      const [cat] = await rows<{ id: string }>(
        db,
        sql`insert into public.categories (name, slug) values (${`Cat ${run}`}, ${`cat-${run}`}) returning id`,
      );
      const names = ["Alfa", "Bravo", "Charlie", "Delta", "Echo"];
      await importCatalog(
        db,
        names.map((n) => ({
          gtin: gtin13(),
          name: `${n} ${run}`,
          categorySlug: `cat-${run}`,
          sizeValue: 1,
          sizeUnit: "un" as const,
        })),
      );

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await listProductsPage(db, { categoryId: cat?.id, limit: 2, after: cursor });
        seen.push(...page.items.map((i) => i.name));
        cursor = page.nextCursor ?? undefined;
        pages++;
        expect(page.items.every((i) => i.thumb === null)).toBe(true);
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toEqual(names.map((n) => `${n} ${run}`));
      await expect(listProductsPage(db, { after: "lixo" })).rejects.toThrow(/cursor/);
    }, 60_000);
  });

  // ── Preços ────────────────────────────────────────────────────────────────
  it("preço versionado: histórico, agendamento e sobreposição recusada", async () => {
    const p = await newProduct("Item de preço");
    const day = 86_400_000;
    const t0 = Date.now();
    const at = (days: number) => new Date(t0 + days * day);
    await setProductPrice(db, {
      priceListId,
      productId: p.id,
      amountMinor: 1000,
      effectiveFrom: at(-10),
    });
    await setProductPrice(db, {
      priceListId,
      productId: p.id,
      amountMinor: 1200,
      effectiveFrom: at(-5),
    });
    await setProductPrice(db, {
      priceListId,
      productId: p.id,
      amountMinor: 900,
      effectiveFrom: at(5),
    });

    const versions = await priceVersions(db, priceListId, p.id);
    expect(versions.map((v) => v.amountMinor)).toEqual([1000, 1200, 900]);
    expect(versions.filter((v) => v.validTo === null)).toHaveLength(1);

    const now = await resolvePrices(db, { storeId, productIds: [p.id] });
    expect(now[0]).toMatchObject({
      listPriceMinor: 1200,
      finalPriceMinor: 1200,
      currencyCode: "BRL",
      discountMinor: 0,
    });
    const later = await resolvePrices(db, { storeId, productIds: [p.id], at: at(6) });
    expect(later[0]?.finalPriceMinor).toBe(900);

    await expect(
      setProductPrice(db, { priceListId, productId: p.id, amountMinor: 1, effectiveFrom: at(-5) }),
    ).rejects.toMatchObject({ code: "price_period_overlap" });
    await expect(
      setProductPrice(db, { priceListId, productId: p.id, amountMinor: -1 }),
    ).rejects.toThrow(RangeError);
  }, 60_000);

  // ── Estoque: concorrência real ────────────────────────────────────────────
  describe("estoque sob concorrência", () => {
    it("25 reservas simultâneas de 1 unidade sobre 10 em estoque: exatamente 10 passam", async () => {
      const p = await newProduct("Item concorrido");
      await receiveStock(db, {
        warehouseId: dc,
        productId: p.id,
        quantity: 10,
        reference: "po-it",
      });

      const attempts = await Promise.allSettled(
        Array.from({ length: 25 }, (_, i) =>
          reserveStock(db, {
            warehouseId: dc,
            productId: p.id,
            quantity: 1,
            reference: `cart-${run}-${i}`,
          }),
        ),
      );
      const ok = attempts.filter(
        (a): a is PromiseFulfilledResult<string> => a.status === "fulfilled",
      );
      const failed = attempts.filter((a): a is PromiseRejectedResult => a.status === "rejected");
      expect(ok).toHaveLength(10);
      expect(failed).toHaveLength(15);
      expect(
        failed.every((f) => (f.reason as { code?: string }).code === "insufficient_stock"),
      ).toBe(true);

      const [s] = await getStock(db, dc, [p.id]);
      expect(s).toEqual({ productId: p.id, onHand: 10, reserved: 10, available: 0 });

      // confirmar todas ao mesmo tempo: baixa exata, reservas zeradas
      await Promise.all(ok.map((r) => commitReservation(db, r.value)));
      const [after] = await getStock(db, dc, [p.id]);
      expect(after).toEqual({ productId: p.id, onHand: 0, reserved: 0, available: 0 });

      // o razão fecha: soma das movimentações == saldo
      const sum = await rows<{ s: string }>(
        db,
        sql`select coalesce(sum(quantity_delta), 0)::text s from public.inventory_movements where warehouse_id = ${dc}::uuid and product_id = ${p.id}::uuid`,
      );
      expect(Number(sum[0]?.s)).toBe(0);
    }, 60_000);

    it("saídas simultâneas nunca deixam o saldo negativo", async () => {
      const p = await newProduct("Item de saída");
      await receiveStock(db, { warehouseId: dc, productId: p.id, quantity: 10 });
      const attempts = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          adjustStock(db, { warehouseId: dc, productId: p.id, delta: -1, kind: "loss" }),
        ),
      );
      expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(10);
      const [s] = await getStock(db, dc, [p.id]);
      expect(s?.onHand).toBe(0);
    }, 60_000);

    it("transferências cruzadas em paralelo não geram deadlock e conservam o total", async () => {
      const p = await newProduct("Item de transferência");
      const [b] = await rows<{ id: string }>(
        db,
        sql`insert into public.warehouses (market_id, code, name, kind)
            values (${marketId}::uuid, ${`dc2-it-${run}`}, 'CD IT 2', 'distribution_center') returning id`,
      );
      const other = b?.id as string;
      await receiveStock(db, { warehouseId: dc, productId: p.id, quantity: 100 });
      await receiveStock(db, { warehouseId: other, productId: p.id, quantity: 100 });

      const results = await Promise.allSettled(
        Array.from({ length: 40 }, (_, i) =>
          i % 2 === 0
            ? transferStock(db, {
                fromWarehouseId: dc,
                toWarehouseId: other,
                productId: p.id,
                quantity: 1,
              })
            : transferStock(db, {
                fromWarehouseId: other,
                toWarehouseId: dc,
                productId: p.id,
                quantity: 1,
              }),
        ),
      );
      expect(results.filter((r) => r.status === "rejected")).toEqual([]);
      const [a1] = await getStock(db, dc, [p.id]);
      const [b1] = await getStock(db, other, [p.id]);
      expect((a1?.onHand ?? 0) + (b1?.onHand ?? 0)).toBe(200);
    }, 60_000);

    it("idempotência e reservas liberadas/expiradas", async () => {
      const p = await newProduct("Item idempotente");
      const key = `rcpt-${run}-${p.id}`;
      const a = await receiveStock(db, {
        warehouseId: dc,
        productId: p.id,
        quantity: 5,
        idempotencyKey: key,
      });
      const b = await receiveStock(db, {
        warehouseId: dc,
        productId: p.id,
        quantity: 5,
        idempotencyKey: key,
      });
      expect(b).toBe(a);
      expect((await getStock(db, dc, [p.id]))[0]?.onHand).toBe(5);

      const r1 = await reserveStock(db, {
        warehouseId: dc,
        productId: p.id,
        quantity: 2,
        reference: `x-${run}`,
      });
      expect(await releaseReservation(db, r1)).toBe(true);
      expect(await releaseReservation(db, r1)).toBe(false);

      const r2 = await reserveStock(db, {
        warehouseId: dc,
        productId: p.id,
        quantity: 2,
        reference: `y-${run}`,
        ttlSeconds: -60,
      });
      await expect(commitReservation(db, r2)).rejects.toMatchObject({
        code: "reservation_not_active",
      });
      expect(
        await (
          await import("../modules/stock/repository/stock.repository")
        ).expireStockReservations(db),
      ).toBeGreaterThanOrEqual(1);
      expect((await getStock(db, dc, [p.id]))[0]?.reserved).toBe(0);
    }, 60_000);
  });

  // ── Promoções ─────────────────────────────────────────────────────────────
  describe("promoções", () => {
    async function activePromo(opts: {
      startsAt: string;
      endsAt: string;
      limit?: number;
      productId: string;
    }): Promise<string> {
      const [pr] = await rows<{ id: string }>(
        db,
        sql`insert into public.promotions (name, kind, discount_percent, starts_at, ends_at, usage_limit_total)
            values (${`Promo IT ${run}`}, 'percent_off', 10, ${opts.startsAt}::timestamptz, ${opts.endsAt}::timestamptz, ${opts.limit ?? null}::integer)
            returning id`,
      );
      const id = pr?.id as string;
      await db.execute(
        sql`insert into public.promotion_products (promotion_id, product_id) values (${id}::uuid, ${opts.productId}::uuid)`,
      );
      await db.execute(
        sql`insert into public.promotion_scopes (promotion_id, market_id) values (${id}::uuid, ${marketId}::uuid)`,
      );
      await db.execute(sql`update public.promotions set status = 'active' where id = ${id}::uuid`);
      return id;
    }

    it("20 resgates simultâneos com teto de 5: exatamente 5 passam; o pedido repetido é idempotente", async () => {
      const p = await newProduct("Item de promoção");
      const id = await activePromo({
        startsAt: new Date(Date.now() - 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        limit: 5,
        productId: p.id,
      });
      const attempts = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          redeemPromotion(db, {
            promotionId: id,
            orderRef: `ord-${run}-${i}`,
            storeId,
            discountMinor: 10,
          }),
        ),
      );
      expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(5);
      expect(
        attempts
          .filter((a): a is PromiseRejectedResult => a.status === "rejected")
          .every((a) => (a.reason as { code?: string }).code === "promotion_unavailable"),
      ).toBe(true);
      const [u] = await rows<{ usage_count: number }>(
        db,
        sql`select usage_count from public.promotions where id = ${id}::uuid`,
      );
      expect(u?.usage_count).toBe(5);

      // repetir um pedido já resgatado devolve o mesmo registro (não consome o teto de novo)
      const first = attempts.find(
        (a): a is PromiseFulfilledResult<string> => a.status === "fulfilled",
      );
      const idx = attempts.indexOf(first as PromiseFulfilledResult<string>);
      await expect(
        redeemPromotion(db, {
          promotionId: id,
          orderRef: `ord-${run}-${idx}`,
          storeId,
          discountMinor: 10,
        }),
      ).resolves.toBe(first?.value);
    }, 60_000);

    it("o job de expiração marca vencidas, é idempotente e preserva a linha; oferta vencida não vale antes do job", async () => {
      const p = await newProduct("Item vencido");
      await setProductPrice(db, {
        priceListId,
        productId: p.id,
        amountMinor: 1000,
        effectiveFrom: new Date(Date.now() - 30 * 86_400_000),
      });
      const id = await activePromo({
        startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        endsAt: new Date(Date.now() - 86_400_000).toISOString(),
        productId: p.id,
      });

      // ANTES do job: ainda "active" no status, mas a consulta já ignora a oferta
      const before = await resolvePrices(db, { storeId, productIds: [p.id] });
      expect(before[0]).toMatchObject({ finalPriceMinor: 1000, appliedPromotionIds: [] });
      await expect(
        redeemPromotion(db, {
          promotionId: id,
          orderRef: `late-${run}`,
          storeId,
          discountMinor: 1,
        }),
      ).rejects.toMatchObject({
        code: "promotion_unavailable",
      });

      expect(await expirePromotions(db)).toBeGreaterThanOrEqual(1);
      const [row] = await rows<{ status: string; expired_at: Date | null }>(
        db,
        sql`select status, expired_at from public.promotions where id = ${id}::uuid`,
      );
      expect(row?.status).toBe("expired");
      expect(row?.expired_at).not.toBeNull();
      expect(await expirePromotions(db)).toBe(0);
    }, 60_000);
  });

  // ── Registro de jobs ──────────────────────────────────────────────────────
  it("trackedJob registra sucesso e falha (e relança), com chave idempotente", async () => {
    const ok = await trackedJob(db, `it.ok.${run}`, `key-ok-${run}`, async () => 7);
    const again = await trackedJob(db, `it.ok.${run}`, `key-ok-${run}`, async () => 7);
    expect(again.runId).toBe(ok.runId);
    const [r1] = await rows<{ status: string; affected: number }>(
      db,
      sql`select status, affected from public.job_runs where id = ${ok.runId}::uuid`,
    );
    expect(r1).toMatchObject({ status: "succeeded", affected: 7 });

    await expect(
      trackedJob(db, `it.fail.${run}`, `key-fail-${run}`, async () => {
        throw new Error("falhou de propósito");
      }),
    ).rejects.toThrow("falhou de propósito");
    const [r2] = await rows<{ status: string; error: string }>(
      db,
      sql`select status, error from public.job_runs where run_key = ${`key-fail-${run}`}`,
    );
    expect(r2).toMatchObject({ status: "failed", error: "falhou de propósito" });
  });
});
