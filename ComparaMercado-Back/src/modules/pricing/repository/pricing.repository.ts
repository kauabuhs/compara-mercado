import { and, asc, eq, sql } from "drizzle-orm";
import type { OrmDb } from "../../../database/client";
import { withDbErrors } from "../../../database/errors";
import { productPrices } from "../../../database/schema";

export interface ResolvedPrice {
  productId: string;
  currencyCode: string;
  /** Unidade menor da moeda (centavos). */
  listPriceMinor: number;
  priceListId: string;
  finalPriceMinor: number;
  discountMinor: number;
  appliedPromotionIds: string[];
  /** Instante até o qual os dados usados são válidos (fim do preço/promoção). Limite máximo de TTL de cache. */
  validUntil: Date | null;
}

type ResolvedRow = {
  product_id: string;
  currency_code: string;
  list_price_minor: string;
  price_list_id: string;
  final_price_minor: string;
  discount_minor: string;
  applied_promotion_ids: string[];
  valid_until: Date | null;
};

/** bigint chega do `pg` como string; nenhum preço real se aproxima de 2^53. */
function toSafeNumber(value: string | number): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new RangeError(`valor monetário fora do intervalo seguro: ${value}`);
  return n;
}

/**
 * Preço final de produtos numa loja, em um instante. Chama `resolve_prices` (SQL): a regra vive
 * no banco e vale igual para a API (RPC) e para o worker. Veja docs/database/precos-e-moedas.md.
 */
export async function resolvePrices(
  db: OrmDb,
  input: { storeId: string; productIds: string[]; at?: Date; quantity?: number },
): Promise<ResolvedPrice[]> {
  const at = input.at ?? new Date();
  const result = await withDbErrors(() =>
    db.execute<ResolvedRow>(
      sql`select * from public.resolve_prices(${input.storeId}::uuid, ${sql.param(input.productIds)}::uuid[], ${at.toISOString()}::timestamptz, ${input.quantity ?? 1}::integer)`,
    ),
  );
  return result.rows.map((r) => ({
    productId: r.product_id,
    currencyCode: r.currency_code,
    listPriceMinor: toSafeNumber(r.list_price_minor),
    priceListId: r.price_list_id,
    finalPriceMinor: toSafeNumber(r.final_price_minor),
    discountMinor: toSafeNumber(r.discount_minor),
    appliedPromotionIds: r.applied_promotion_ids,
    validUntil: r.valid_until,
  }));
}

/**
 * Muda o preço de um produto numa lista, de forma atômica: encerra a versão vigente e abre
 * outra. `effectiveFrom` pode ser futuro (preço agendado).
 */
export async function setProductPrice(
  db: OrmDb,
  input: { priceListId: string; productId: string; amountMinor: number; effectiveFrom?: Date },
): Promise<string> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new RangeError("amountMinor deve ser um inteiro >= 0 (unidade menor da moeda)");
  }
  const from = input.effectiveFrom ?? new Date();
  const result = await withDbErrors(() =>
    db.execute<{ id: string }>(
      sql`select public.set_product_price(${input.priceListId}::uuid, ${input.productId}::uuid, ${input.amountMinor}::bigint, ${from.toISOString()}::timestamptz) as id`,
    ),
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("set_product_price não devolveu id");
  return id;
}

/** Histórico de preço de um produto numa lista (da versão mais antiga à mais nova). */
export function priceVersions(db: OrmDb, priceListId: string, productId: string) {
  return db
    .select({
      id: productPrices.id,
      amountMinor: productPrices.amountMinor,
      validFrom: productPrices.validFrom,
      validTo: productPrices.validTo,
    })
    .from(productPrices)
    .where(and(eq(productPrices.priceListId, priceListId), eq(productPrices.productId, productId)))
    .orderBy(asc(productPrices.validFrom));
}
