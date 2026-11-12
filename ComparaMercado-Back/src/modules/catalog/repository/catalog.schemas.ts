import { z } from "zod";
import type {
  ListComparison,
  PriceOfferBase,
  PricePoint,
  Product,
  ProductHit,
  SplitPlan,
  Store,
  StoreTotal,
} from "../../../contracts";

// Tudo que volta do banco por RPC/visão é validado: o tipo gerado diz o que o Postgres declara,
// o Zod garante o que o app de fato recebe. Cada mapeador devolve um tipo de `src/contracts`:
// nomes de colunas (snake_case) ficam só aqui e nunca chegam ao front-end.

const sizeUnit = z.enum(["g", "kg", "ml", "l", "un"]);
const baseUnit = z.enum(["kg", "l", "un"]);

export const ProductHitSchema = z
  .object({
    product_id: z.uuid(),
    canonical_name: z.string(),
    brand: z.string().nullable(),
    size_value: z.coerce.number(),
    size_unit: sizeUnit,
    base_unit: baseUnit,
    category_id: z.uuid().nullable(),
    score: z.number(),
    min_unit_price_cents: z.number().int().nullable(),
    store_count: z.number().int(),
  })
  .transform(
    (row): ProductHit => ({
      productId: row.product_id,
      name: row.canonical_name,
      brand: row.brand,
      sizeValue: row.size_value,
      sizeUnit: row.size_unit,
      baseUnit: row.base_unit,
      categoryId: row.category_id,
      score: row.score,
      minUnitPriceCents: row.min_unit_price_cents,
      storeCount: row.store_count,
    }),
  );

export const ProductSchema = z
  .object({
    id: z.uuid(),
    canonical_name: z.string(),
    brand: z.string().nullable(),
    size_value: z.coerce.number(),
    size_unit: sizeUnit,
    base_unit: baseUnit,
    category_id: z.uuid().nullable(),
  })
  .transform(
    (row): Product => ({
      id: row.id,
      name: row.canonical_name,
      brand: row.brand,
      sizeValue: row.size_value,
      sizeUnit: row.size_unit,
      baseUnit: row.base_unit,
      categoryId: row.category_id,
    }),
  );

export const PriceOfferSchema = z
  .object({
    store_id: z.uuid(),
    product_id: z.uuid(),
    price_cents: z.number().int(),
    unit_price_cents: z.number().int(),
    promo: z.boolean(),
    valid_to: z.string().nullable(),
    observed_at: z.string(),
    store_name: z.string(),
    store_neighborhood: z.string().nullable(),
    canonical_name: z.string(),
    brand: z.string().nullable(),
    size_value: z.coerce.number(),
    size_unit: sizeUnit,
    base_unit: baseUnit,
    category_id: z.uuid().nullable(),
  })
  .transform(
    (row): PriceOfferBase => ({
      storeId: row.store_id,
      productId: row.product_id,
      priceCents: row.price_cents,
      unitPriceCents: row.unit_price_cents,
      promo: row.promo,
      validTo: row.valid_to,
      observedAt: row.observed_at,
      storeName: row.store_name,
      storeNeighborhood: row.store_neighborhood,
      productName: row.canonical_name,
      brand: row.brand,
      sizeValue: row.size_value,
      sizeUnit: row.size_unit,
      baseUnit: row.base_unit,
      categoryId: row.category_id,
    }),
  );

export const StoreSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    address: z.string().nullable(),
    neighborhood: z.string().nullable(),
    opening_hours: z.record(z.string(), z.unknown()).nullable(),
    city_id: z.uuid(),
    lat: z.number(),
    lng: z.number(),
  })
  .transform(
    (row): Store => ({
      id: row.id,
      name: row.name,
      address: row.address,
      neighborhood: row.neighborhood,
      openingHours: row.opening_hours,
      cityId: row.city_id,
      lat: row.lat,
      lng: row.lng,
    }),
  );

export const PricePointSchema = z
  .object({
    store_id: z.uuid(),
    price_cents: z.number().int(),
    unit_price_cents: z.number().int(),
    promo: z.boolean(),
    observed_at: z.string(),
  })
  .transform(
    (row): PricePoint => ({
      storeId: row.store_id,
      priceCents: row.price_cents,
      unitPriceCents: row.unit_price_cents,
      promo: row.promo,
      observedAt: row.observed_at,
    }),
  );

const StoreTotalSchema = z
  .object({
    store_id: z.uuid(),
    name: z.string(),
    total_cents: z.number().int(),
    found_count: z.number().int(),
    missing_product_ids: z.array(z.uuid()),
    complete: z.boolean(),
    distance_meters: z.number().nullable(),
  })
  .transform(
    (row): StoreTotal => ({
      storeId: row.store_id,
      name: row.name,
      totalCents: row.total_cents,
      foundCount: row.found_count,
      missingProductIds: row.missing_product_ids,
      complete: row.complete,
      distanceMeters: row.distance_meters,
    }),
  );

const SplitSchema = z
  .object({
    store_ids: z.tuple([z.uuid(), z.uuid()]),
    total_cents: z.number().int(),
    savings_cents: z.number().int(),
    extra_distance_meters: z.number().nullable(),
    missing_product_ids: z.array(z.uuid()),
    assignments: z.array(
      z.object({
        product_id: z.uuid(),
        store_id: z.uuid(),
        price_cents: z.number().int(),
        quantity: z.number().int(),
      }),
    ),
  })
  .transform(
    (row): SplitPlan => ({
      storeIds: row.store_ids,
      totalCents: row.total_cents,
      savingsCents: row.savings_cents,
      extraDistanceMeters: row.extra_distance_meters,
      missingProductIds: row.missing_product_ids,
      assignments: row.assignments.map((assignment) => ({
        productId: assignment.product_id,
        storeId: assignment.store_id,
        priceCents: assignment.price_cents,
        quantity: assignment.quantity,
      })),
    }),
  );

export const CompareResultSchema = z
  .object({
    stores: z.array(StoreTotalSchema),
    best_single: StoreTotalSchema.nullable(),
    best_split: SplitSchema.nullable(),
  })
  .transform(
    (row): ListComparison => ({
      stores: row.stores,
      bestSingle: row.best_single,
      bestSplit: row.best_split,
    }),
  );
