import { z } from "zod";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
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

/** Busca com tolerância a erro de digitação e sem acento (pg_trgm). */
export async function searchProducts(db: Db, query: string, limit = 20) {
  const rows = unwrap(await db.rpc("search_products", { p_query: query, p_limit: limit }));
  return z.array(ProductHitSchema).parse(rows);
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

/** Ofertas vigentes (promoções com validade), das que vencem primeiro às mais longas. */
export async function listOffers(db: Db, options: { storeId?: string; limit?: number } = {}) {
  let query = db.from("price_board").select("*").eq("promo", true);
  if (options.storeId) query = query.eq("store_id", options.storeId);
  const rows = unwrap(
    await query
      .order("valid_to", { ascending: true, nullsFirst: false })
      .limit(options.limit ?? 60),
  );
  return z.array(PriceOfferSchema).parse(rows);
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
