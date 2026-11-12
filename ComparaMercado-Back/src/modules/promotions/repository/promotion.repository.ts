import { sql } from "drizzle-orm";
import type { OrmDb } from "../../../database/client";
import { withDbErrors } from "../../../database/errors";

/**
 * Marca como `expired` as promoções vencidas. COMPLEMENTA a vigência calculada na consulta
 * (que já impede o uso de oferta vencida): serve para o status refletir a realidade em
 * relatórios e painéis. Idempotente. Devolve quantas promoções mudaram.
 */
export async function expirePromotions(db: OrmDb, at: Date = new Date()): Promise<number> {
  const r = await withDbErrors(() =>
    db.execute<{ n: number }>(
      sql`select public.expire_promotions(${at.toISOString()}::timestamptz) as n`,
    ),
  );
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Registra o uso de uma promoção num pedido. Atômico e idempotente por (promoção, pedido).
 * Erros: `promotion_unavailable`, `promotion_customer_limit`, `promotion_out_of_scope`.
 */
export async function redeemPromotion(
  db: OrmDb,
  i: {
    promotionId: string;
    orderRef: string;
    storeId: string;
    userId?: string | null;
    /** Desconto efetivamente concedido, em unidade menor da moeda. */
    discountMinor: number;
    at?: Date;
  },
): Promise<string> {
  if (!Number.isSafeInteger(i.discountMinor) || i.discountMinor < 0) {
    throw new RangeError("discountMinor deve ser um inteiro >= 0");
  }
  const r = await withDbErrors(() =>
    db.execute<{ id: string }>(
      sql`select public.redeem_promotion(${i.promotionId}::uuid, ${i.orderRef}, ${i.storeId}::uuid,
        ${i.userId ?? null}::uuid, ${i.discountMinor}::bigint, ${(i.at ?? new Date()).toISOString()}::timestamptz) as id`,
    ),
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error("redeem_promotion não devolveu id");
  return id;
}
