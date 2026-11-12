import { z } from "zod";
import type { OffersSort, PriceOfferBase, ProductHit } from "../../../contracts";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import type { Paged } from "../../../lib/pagination";
import type { ListItem } from "../service/compare";
import {
  CompareResultSchema,
  PriceOfferSchema,
  PricePointSchema,
  ProductHitSchema,
  ProductSchema,
  StoreSchema,
} from "./catalog.schemas";

function unwrap<T>(productResult: {
  data: T | null;
  error: { message: string; code?: string } | null;
}): T {
  if (productResult.error)
    throw new DbError(productResult.error.message, productResult.error.code, {
      cause: productResult.error,
    });
  if (productResult.data === null) throw new DbError("resposta vazia do banco");
  return productResult.data;
}

const TotalRowsSchema = z.array(z.object({ total_count: z.coerce.number().int() }));

/**
 * Total de uma listagem paginada. Cada linha da página traz `total_count`; numa página além do
 * fim não há linhas, então uma consulta mínima da primeira página informa o total real (a
 * interface usa isso para levar o usuário à última página em vez de mostrar "0 resultados").
 */
async function totalOf(
  pageRows: readonly unknown[],
  offset: number,
  firstRow: () => Promise<readonly unknown[]>,
): Promise<number> {
  const rows = pageRows.length === 0 && offset > 0 ? await firstRow() : pageRows;
  return TotalRowsSchema.parse(rows)[0]?.total_count ?? 0;
}

/** Busca com tolerância a erro de digitação e sem acento (pg_trgm), paginada no banco. */
export async function searchProducts(
  db: Db,
  query: string,
  options: { limit?: number; offset?: number; onlyPriced?: boolean } = {},
): Promise<Paged<ProductHit>> {
  const { limit = 20, offset = 0, onlyPriced = false } = options;
  const call = async (pageLimit: number, pageOffset: number) =>
    unwrap(
      await db.rpc("search_products_page", {
        p_query: query,
        p_limit: pageLimit,
        p_offset: pageOffset,
        p_only_priced: onlyPriced,
      }),
    );
  const rows = await call(limit, offset);
  return {
    items: z.array(ProductHitSchema).parse(rows),
    total: await totalOf(rows, offset, () => call(1, 0)),
  };
}

/** Preço do produto em cada mercado, do mais barato (por unidade base) ao mais caro. */
export async function getProductPrices(db: Db, productId: string) {
  const rows = unwrap(
    await db
      .from("price_board")
      .select("*")
      .eq("product_id", productId)
      .order("unit_price_cents", { ascending: true }),
  );
  return z.array(PriceOfferSchema).parse(rows);
}

export interface ListOffersOptions {
  storeId?: string;
  query?: string;
  sort?: OffersSort;
  expiringSoon?: boolean;
  limit?: number;
  offset?: number;
}

/** Ofertas vigentes (promoções): busca, filtro, ordenação e página decididos no banco. */
export async function listOffers(
  db: Db,
  options: ListOffersOptions = {},
): Promise<Paged<PriceOfferBase>> {
  const { limit = 20, offset = 0 } = options;
  const call = async (pageLimit: number, pageOffset: number) =>
    unwrap(
      await db.rpc("list_offers_page", {
        ...(options.storeId ? { p_store_id: options.storeId } : {}),
        ...(options.query ? { p_query: options.query } : {}),
        p_expiring: options.expiringSoon ?? false,
        p_sort: options.sort ?? "featured",
        p_limit: pageLimit,
        p_offset: pageOffset,
      }),
    );
  const rows = await call(limit, offset);
  return {
    items: z.array(PriceOfferSchema).parse(rows),
    total: await totalOf(rows, offset, () => call(1, 0)),
  };
}

/** Produto ativo por id; null se não existe (ou está arquivado). */
export async function getProduct(db: Db, productId: string) {
  const productResult = await db
    .from("products")
    .select("id,canonical_name,brand,size_value,size_unit,base_unit,category_id")
    .eq("id", productId)
    .maybeSingle();
  if (productResult.error)
    throw new DbError(productResult.error.message, productResult.error.code, {
      cause: productResult.error,
    });
  if (!productResult.data) return null;
  return ProductSchema.parse(productResult.data);
}

export async function listStores(db: Db, cityId?: string) {
  let query = db
    .from("stores")
    // só lojas de cidades habilitadas no comparador (cities.active)
    .select("id,name,address,neighborhood,opening_hours,city_id,lat,lng,cities!inner(active)")
    .eq("status", "active")
    .eq("cities.active", true);
  if (cityId) query = query.eq("city_id", cityId);
  const rows = unwrap(await query.order("name"));
  return z.array(StoreSchema).parse(rows);
}

export async function listCities(db: Db) {
  return unwrap(
    await db.from("cities").select("id,name,uf,ibge_code").eq("active", true).order("name"),
  );
}

export async function getPriceHistory(
  db: Db,
  productId: string,
  options: { storeId?: string; days?: number } = {},
) {
  const rows = unwrap(
    await db.rpc("price_history", {
      p_product_id: productId,
      ...(options.storeId ? { p_store_id: options.storeId } : {}),
      p_days: options.days ?? 90,
    }),
  );
  return z.array(PricePointSchema).parse(rows);
}

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Compara a lista entre mercados no banco (função SQL `compare_list`).
 * A localização é usada só nesta consulta e nunca é gravada.
 */
export async function compareList(db: Db, items: readonly ListItem[], where?: Coordinates) {
  const payload = items.map((item) => ({ product_id: item.productId, quantity: item.quantity }));
  const raw = unwrap(
    await db.rpc("compare_list", {
      p_items: payload,
      ...(where ? { p_lat: where.lat, p_lng: where.lng } : {}),
    }),
  );
  return CompareResultSchema.parse(raw);
}
