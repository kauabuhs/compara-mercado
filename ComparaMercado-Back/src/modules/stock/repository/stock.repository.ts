import { and, eq, inArray, sql } from "drizzle-orm";
import type { OrmDb } from "../../../database/client";
import { withDbErrors } from "../../../database/errors";
import { inventory } from "../../../database/schema";

/**
 * Operações de estoque. Toda a lógica e as garantias de concorrência estão em funções SQL
 * (`ComparaMercado-Back/supabase/migrations/…013…`): cada uma é um único UPDATE condicional + o registro no
 * razão, na mesma transação. Aqui só há tipagem e tradução de erros:
 *   `insufficient_stock` (ST001) · `reservation_not_active` (ST002).
 *
 * Quantidades: `number` com até 3 casas (kg/litro). Produtos vendidos por unidade exigem inteiro.
 */

const q = (n: number): string => {
  if (!Number.isFinite(n)) throw new RangeError("quantidade inválida");
  return n.toFixed(3);
};

async function scalar<T>(db: OrmDb, query: ReturnType<typeof sql>): Promise<T> {
  const result = await withDbErrors(() => db.execute<{ v: T }>(query));
  return result.rows[0]?.v as T;
}

export interface ReceiveInput {
  warehouseId: string;
  productId: string;
  quantity: number;
  /** Nota fiscal / ordem de compra. */
  reference?: string;
  supplierId?: string;
  unitCostMinor?: number;
  costCurrency?: string;
  /** Repetir a chamada com a mesma chave não soma duas vezes. */
  idempotencyKey?: string;
}

/** Entrada de mercadoria. Devolve o id da movimentação. */
export async function receiveStock(db: OrmDb, i: ReceiveInput): Promise<number> {
  const id = await scalar<string>(
    db,
    sql`select public.stock_apply_movement(${i.warehouseId}::uuid, ${i.productId}::uuid, 'receipt', ${q(i.quantity)}::numeric,
      ${i.reference ?? null}, null, ${i.supplierId ?? null}::uuid, ${i.unitCostMinor ?? null}::bigint,
      ${i.costCurrency ?? null}::char(3), ${i.idempotencyKey ?? null}, null) as v`,
  );
  return Number(id);
}

export interface AdjustInput {
  warehouseId: string;
  productId: string;
  /** Positivo soma, negativo subtrai. */
  delta: number;
  kind?: "adjustment" | "loss" | "damage" | "return";
  reference?: string;
  note?: string;
  idempotencyKey?: string;
}

/** Ajuste de inventário, perda, avaria ou devolução. */
export async function adjustStock(db: OrmDb, i: AdjustInput): Promise<number> {
  const id = await scalar<string>(
    db,
    sql`select public.stock_apply_movement(${i.warehouseId}::uuid, ${i.productId}::uuid,
      ${i.kind ?? "adjustment"}::public.movement_kind, ${q(i.delta)}::numeric, ${i.reference ?? null}, ${i.note ?? null},
      null, null, null, ${i.idempotencyKey ?? null}, null) as v`,
  );
  return Number(id);
}

/** Reserva disponível (carrinho/pedido). Idempotente por (depósito, produto, referência). */
export async function reserveStock(
  db: OrmDb,
  i: {
    warehouseId: string;
    productId: string;
    quantity: number;
    reference: string;
    ttlSeconds?: number;
  },
): Promise<string> {
  return scalar<string>(
    db,
    sql`select public.reserve_stock(${i.warehouseId}::uuid, ${i.productId}::uuid, ${q(i.quantity)}::numeric,
      ${i.reference}, make_interval(secs => ${i.ttlSeconds ?? 900})) as v`,
  );
}

/** Confirma a venda de uma reserva (baixa o físico). Idempotente. Devolve o id da movimentação. */
export async function commitReservation(
  db: OrmDb,
  reservationId: string,
  reference?: string,
): Promise<number> {
  const id = await scalar<string>(
    db,
    sql`select public.commit_reservation(${reservationId}::uuid, ${reference ?? null}) as v`,
  );
  return Number(id);
}

/** Cancela uma reserva ativa. `false` se já estava liberada/expirada. */
export function releaseReservation(db: OrmDb, reservationId: string): Promise<boolean> {
  return scalar<boolean>(db, sql`select public.release_reservation(${reservationId}::uuid) as v`);
}

/** Transfere entre depósitos (duas pernas, uma transação). Devolve o `transfer_id`. */
export function transferStock(
  db: OrmDb,
  i: {
    fromWarehouseId: string;
    toWarehouseId: string;
    productId: string;
    quantity: number;
    reference?: string;
  },
): Promise<string> {
  return scalar<string>(
    db,
    sql`select public.transfer_stock(${i.fromWarehouseId}::uuid, ${i.toWarehouseId}::uuid, ${i.productId}::uuid,
      ${q(i.quantity)}::numeric, ${i.reference ?? null}) as v`,
  );
}

/** Devolve ao disponível as reservas vencidas. Idempotente. Devolve quantas expirou. */
export async function expireStockReservations(db: OrmDb, at: Date = new Date()): Promise<number> {
  return Number(
    await scalar<number>(
      db,
      sql`select public.expire_stock_reservations(${at.toISOString()}::timestamptz) as v`,
    ),
  );
}

export interface StockLevel {
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
}

/** Saldos de vários produtos em um depósito, numa consulta só (sem N+1). */
export async function getStock(
  db: OrmDb,
  warehouseId: string,
  productIds: string[],
): Promise<StockLevel[]> {
  if (productIds.length === 0) return [];
  const rows = await db
    .select({
      productId: inventory.productId,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      available: inventory.available,
    })
    .from(inventory)
    .where(and(eq(inventory.warehouseId, warehouseId), inArray(inventory.productId, productIds)));
  return rows.map((r) => ({
    productId: r.productId,
    onHand: Number(r.onHand),
    reserved: Number(r.reserved),
    available: Number(r.available),
  }));
}
