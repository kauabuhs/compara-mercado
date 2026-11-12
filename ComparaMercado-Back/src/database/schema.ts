/**
 * SCHEMA DO BANCO — todas as tabelas, views e colunas (schema `public`), em Drizzle.
 *
 * ⚠ ARQUIVO GERADO por `pnpm db:schema` a partir do banco. NÃO edite à mão.
 *   Para mudar o modelo: crie uma migração em `supabase/migrations`, aplique-a e rode `pnpm db:schema`.
 *
 * O que está aqui: tabelas, colunas, tipos, nulabilidade, valores padrão, colunas geradas, chaves
 * primárias e chaves estrangeiras simples. O que NÃO está (vive na migração SQL, que é a fonte da
 * verdade): CHECKs, índices, RLS/políticas, gatilhos e funções. Ver docs/adr/0006.
 * Dinheiro = `bigint` em unidade menor da moeda; datas = `timestamptz` (UTC).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgTable,
  pgView,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** PostGIS `geography`: o valor trafega como texto (EWKB hex); consultas espaciais usam `sql`. */
const geography = customType<{ data: string }>({ dataType: () => "geography" });

// ─── Tipos enumerados ────────────────────────────────────────────────────────

export const aliasStatus = pgEnum("alias_status", ["pending", "approved", "rejected"]);
export const allergenPresence = pgEnum("allergen_presence", ["contains", "may_contain"]);
export const attributeValueType = pgEnum("attribute_value_type", ["text", "number", "boolean"]);
export const baseUnit = pgEnum("base_unit", ["kg", "l", "un"]);
export const identifierType = pgEnum("identifier_type", [
  "gtin_alt",
  "sku",
  "internal_code",
  "plu",
  "mpn",
]);
export const jobRunStatus = pgEnum("job_run_status", ["running", "succeeded", "failed"]);
export const mediaFormat = pgEnum("media_format", ["webp", "avif", "jpeg"]);
export const mediaStatus = pgEnum("media_status", ["pending", "processing", "ready", "failed"]);
export const mediaVariant = pgEnum("media_variant", ["thumb", "small", "medium", "large"]);
export const movementKind = pgEnum("movement_kind", [
  "receipt",
  "sale",
  "return",
  "adjustment",
  "transfer_out",
  "transfer_in",
  "loss",
  "damage",
]);
export const nutritionBasis = pgEnum("nutrition_basis", ["per_100g", "per_100ml"]);
export const observationSource = pgEnum("observation_source", [
  "manual",
  "flyer",
  "label_photo",
  "receipt",
  "store_panel",
]);
export const observationStatus = pgEnum("observation_status", [
  "pending",
  "approved",
  "rejected",
  "superseded",
]);
export const promotionKind = pgEnum("promotion_kind", [
  "percent_off",
  "amount_off",
  "fixed_price",
  "bundle_price",
  "buy_x_pay_y",
]);
export const promotionRuleKind = pgEnum("promotion_rule_kind", [
  "target_category",
  "target_brand",
  "min_quantity",
  "min_spend",
]);
export const promotionStatus = pgEnum("promotion_status", [
  "draft",
  "active",
  "paused",
  "expired",
  "cancelled",
]);
export const recordStatus = pgEnum("record_status", ["draft", "active", "archived"]);
export const reservationStatus = pgEnum("reservation_status", [
  "active",
  "committed",
  "released",
  "expired",
]);
export const reviewStatus = pgEnum("review_status", [
  "open",
  "in_progress",
  "resolved",
  "dismissed",
]);
export const reviewTarget = pgEnum("review_target", [
  "price_observation",
  "product_alias",
  "source",
]);
export const saleMode = pgEnum("sale_mode", ["per_unit", "by_weight", "by_volume"]);
export const sizeUnit = pgEnum("size_unit", ["g", "kg", "ml", "l", "un"]);
export const sourceKind = pgEnum("source_kind", ["flyer", "label", "receipt"]);
export const sourceStatus = pgEnum("source_status", [
  "uploaded",
  "processing",
  "extracted",
  "failed",
  "reviewed",
]);
export const storeStatus = pgEnum("store_status", ["pending", "active", "inactive"]);
export const userRole = pgEnum("user_role", ["user", "contributor", "admin"]);
export const warehouseKind = pgEnum("warehouse_kind", ["distribution_center", "store_stock"]);

// ─── Geografia e mercados ──────────────────────────────────────────────────────

export const currencies = pgTable("currencies", {
  code: char("code", { length: 3 }).primaryKey(),
  name: text("name").notNull(),
  minorUnit: smallint("minor_unit").notNull(),
  symbol: text("symbol"),
  active: boolean("active").notNull().default(true),
});

export const countries = pgTable("countries", {
  code: char("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(),
  defaultCurrency: char("default_currency", { length: 3 })
    .notNull()
    .references((): AnyPgColumn => currencies.code),
  active: boolean("active").notNull().default(false),
});

export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryCode: char("country_code", { length: 2 })
    .notNull()
    .references((): AnyPgColumn => countries.code),
  parentId: uuid("parent_id").references((): AnyPgColumn => regions.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
});

export const markets = pgTable("markets", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  countryCode: char("country_code", { length: 2 })
    .notNull()
    .references((): AnyPgColumn => countries.code),
  regionId: uuid("region_id").references((): AnyPgColumn => regions.id),
  currencyCode: char("currency_code", { length: 3 })
    .notNull()
    .references((): AnyPgColumn => currencies.code),
  timezone: text("timezone").notNull(),
  locale: text("locale").notNull().default("pt-BR"),
  pricesIncludeTax: boolean("prices_include_tax").notNull().default(true),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  ibgeCode: text("ibge_code"),
  name: text("name").notNull(),
  uf: char("uf", { length: 2 }),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  countryCode: char("country_code", { length: 2 })
    .notNull()
    .default("BR")
    .references((): AnyPgColumn => countries.code),
  regionId: uuid("region_id").references((): AnyPgColumn => regions.id),
});

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id")
    .notNull()
    .references((): AnyPgColumn => cities.id),
  name: text("name").notNull(),
  cnpj: text("cnpj"),
  address: text("address"),
  neighborhood: text("neighborhood"),
  location: geography("location").notNull(),
  lng: doublePrecision("lng").generatedAlwaysAs(sql`st_x((location)::geometry)`),
  lat: doublePrecision("lat").generatedAlwaysAs(sql`st_y((location)::geometry)`),
  openingHours: jsonb("opening_hours"),
  status: storeStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  marketId: uuid("market_id")
    .notNull()
    .references((): AnyPgColumn => markets.id),
});

// ─── Catálogo: marcas, famílias (identidade) e variantes ───────────────────────

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  manufacturer: text("manufacturer"),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const productFamilies = pgTable("product_families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  brandId: uuid("brand_id").references((): AnyPgColumn => brands.id),
  categoryId: uuid("category_id").references((): AnyPgColumn => categories.id),
  description: text("description"),
  ingredients: text("ingredients"),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  gtin: text("gtin"),
  canonicalName: text("canonical_name").notNull(),
  brand: text("brand"),
  categoryId: uuid("category_id").references((): AnyPgColumn => categories.id),
  sizeValue: numeric("size_value", { precision: 12, scale: 3 }).notNull(),
  sizeUnit: sizeUnit("size_unit").notNull(),
  baseUnit: baseUnit("base_unit").generatedAlwaysAs(sql`
CASE size_unit
    WHEN 'g'::size_unit THEN 'kg'::base_unit
    WHEN 'kg'::size_unit THEN 'kg'::base_unit
    WHEN 'ml'::size_unit THEN 'l'::base_unit
    WHEN 'l'::size_unit THEN 'l'::base_unit
    ELSE 'un'::base_unit
END`),
  baseQuantity: numeric("base_quantity", { precision: 14, scale: 6 }).generatedAlwaysAs(sql`
CASE size_unit
    WHEN 'g'::size_unit THEN (size_value / (1000)::numeric)
    WHEN 'ml'::size_unit THEN (size_value / (1000)::numeric)
    ELSE size_value
END`),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  familyId: uuid("family_id")
    .notNull()
    .default(
      sql`null`,
    ) /* NOT NULL no banco; o gatilho products_resolve_family preenche quando omitido */
    .references((): AnyPgColumn => productFamilies.id),
  brandId: uuid("brand_id").references((): AnyPgColumn => brands.id),
  saleMode: saleMode("sale_mode").notNull().default("per_unit"),
  packQuantity: integer("pack_quantity").notNull().default(1),
  variantLabel: text("variant_label"),
  grossWeightG: numeric("gross_weight_g", { precision: 10, scale: 2 }),
  lengthMm: integer("length_mm"),
  widthMm: integer("width_mm"),
  heightMm: integer("height_mm"),
});

export const productIdentifiers = pgTable("product_identifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references((): AnyPgColumn => products.id),
  idType: identifierType("id_type").notNull(),
  value: text("value").notNull(),
  marketId: uuid("market_id").references((): AnyPgColumn => markets.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const attributeDefinitions = pgTable("attribute_definitions", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  valueType: attributeValueType("value_type").notNull(),
  unit: text("unit"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** chave primária composta: (family_id, attribute_code) */
export const familyAttributeValues = pgTable(
  "family_attribute_values",
  {
    familyId: uuid("family_id")
      .notNull()
      .references((): AnyPgColumn => productFamilies.id),
    attributeCode: text("attribute_code")
      .notNull()
      .references((): AnyPgColumn => attributeDefinitions.code),
    valueText: text("value_text"),
    valueNumber: numeric("value_number"),
    valueBoolean: boolean("value_boolean"),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.attributeCode] })],
);

export const allergens = pgTable("allergens", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

/** chave primária composta: (family_id, allergen_code) */
export const familyAllergens = pgTable(
  "family_allergens",
  {
    familyId: uuid("family_id")
      .notNull()
      .references((): AnyPgColumn => productFamilies.id),
    allergenCode: text("allergen_code")
      .notNull()
      .references((): AnyPgColumn => allergens.code),
    presence: allergenPresence("presence").notNull(),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.allergenCode] })],
);

export const familyNutrition = pgTable("family_nutrition", {
  familyId: uuid("family_id")
    .primaryKey()
    .references((): AnyPgColumn => productFamilies.id),
  basis: nutritionBasis("basis").notNull(),
  servingSize: numeric("serving_size", { precision: 8, scale: 2 }),
  energyKcal: numeric("energy_kcal", { precision: 7, scale: 2 }),
  fatG: numeric("fat_g", { precision: 7, scale: 2 }),
  saturatedFatG: numeric("saturated_fat_g", { precision: 7, scale: 2 }),
  carbohydrateG: numeric("carbohydrate_g", { precision: 7, scale: 2 }),
  sugarsG: numeric("sugars_g", { precision: 7, scale: 2 }),
  fiberG: numeric("fiber_g", { precision: 7, scale: 2 }),
  proteinG: numeric("protein_g", { precision: 7, scale: 2 }),
  sodiumMg: numeric("sodium_mg", { precision: 8, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const productThumbnails = pgView("product_thumbnails", {
  productId: uuid("product_id"),
  assetId: uuid("asset_id"),
  altText: text("alt_text"),
  thumbKey: text("thumb_key"),
  thumbWidth: integer("thumb_width"),
  thumbHeight: integer("thumb_height"),
}).existing();

// ─── Preços publicados ─────────────────────────────────────────────────────────

/** FK composta: (market_id, currency_code) → markets(id, currency_code) · FK composta: (store_id, market_id) → stores(id, market_id) */
export const priceLists = pgTable("price_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("market_id").notNull(),
  currencyCode: char("currency_code", { length: 3 }).notNull(),
  storeId: uuid("store_id"),
  name: text("name").notNull(),
  priority: smallint("priority").notNull().default(0),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const productPrices = pgTable("product_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  priceListId: uuid("price_list_id")
    .notNull()
    .references((): AnyPgColumn => priceLists.id),
  productId: uuid("product_id")
    .notNull()
    .references((): AnyPgColumn => products.id),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
  createdBy: uuid("created_by")
    .default(sql`auth.uid()`)
    .references((): AnyPgColumn => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ─── Promoções ─────────────────────────────────────────────────────────────────

export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  kind: promotionKind("kind").notNull(),
  currencyCode: char("currency_code", { length: 3 }).references((): AnyPgColumn => currencies.code),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
  discountAmountMinor: bigint("discount_amount_minor", { mode: "number" }),
  fixedPriceMinor: bigint("fixed_price_minor", { mode: "number" }),
  buyQuantity: integer("buy_quantity"),
  payQuantity: integer("pay_quantity"),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
  status: promotionStatus("status").notNull().default("draft"),
  stackable: boolean("stackable").notNull().default(false),
  priority: smallint("priority").notNull().default(0),
  usageLimitTotal: integer("usage_limit_total"),
  usageLimitPerCustomer: integer("usage_limit_per_customer"),
  usageCount: integer("usage_count").notNull().default(0),
  createdBy: uuid("created_by")
    .default(sql`auth.uid()`)
    .references((): AnyPgColumn => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiredAt: timestamp("expired_at", { withTimezone: true, mode: "date" }),
});

/** chave primária composta: (promotion_id, product_id) */
export const promotionProducts = pgTable(
  "promotion_products",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references((): AnyPgColumn => promotions.id),
    productId: uuid("product_id")
      .notNull()
      .references((): AnyPgColumn => products.id),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.promotionId, t.productId] })],
);

export const promotionRules = pgTable("promotion_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  promotionId: uuid("promotion_id")
    .notNull()
    .references((): AnyPgColumn => promotions.id),
  kind: promotionRuleKind("kind").notNull(),
  categoryId: uuid("category_id").references((): AnyPgColumn => categories.id),
  brandId: uuid("brand_id").references((): AnyPgColumn => brands.id),
  quantity: integer("quantity"),
  amountMinor: bigint("amount_minor", { mode: "number" }),
});

/** FK composta: (store_id, market_id) → stores(id, market_id) */
export const promotionScopes = pgTable("promotion_scopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  promotionId: uuid("promotion_id")
    .notNull()
    .references((): AnyPgColumn => promotions.id),
  marketId: uuid("market_id")
    .notNull()
    .references((): AnyPgColumn => markets.id),
  storeId: uuid("store_id"),
});

export const promotionUsage = pgTable("promotion_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  promotionId: uuid("promotion_id")
    .notNull()
    .references((): AnyPgColumn => promotions.id),
  userId: uuid("user_id").references((): AnyPgColumn => profiles.id),
  storeId: uuid("store_id")
    .notNull()
    .references((): AnyPgColumn => stores.id),
  orderRef: text("order_ref").notNull(),
  discountMinor: bigint("discount_minor", { mode: "number" }).notNull(),
  currencyCode: char("currency_code", { length: 3 })
    .notNull()
    .references((): AnyPgColumn => currencies.code),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ─── Estoque e fornecedores ────────────────────────────────────────────────────

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  taxId: text("tax_id"),
  countryCode: char("country_code", { length: 2 }).references((): AnyPgColumn => countries.code),
  email: text("email"),
  phone: text("phone"),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** chave primária composta: (supplier_id, product_id) */
export const supplierProducts = pgTable(
  "supplier_products",
  {
    supplierId: uuid("supplier_id")
      .notNull()
      .references((): AnyPgColumn => suppliers.id),
    productId: uuid("product_id")
      .notNull()
      .references((): AnyPgColumn => products.id),
    supplierSku: text("supplier_sku"),
    costMinor: bigint("cost_minor", { mode: "number" }).notNull(),
    currencyCode: char("currency_code", { length: 3 })
      .notNull()
      .references((): AnyPgColumn => currencies.code),
    minOrderQuantity: numeric("min_order_quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("1"),
    leadTimeDays: smallint("lead_time_days"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.supplierId, t.productId] })],
);

/** FK composta: (store_id, market_id) → stores(id, market_id) */
export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("market_id")
    .notNull()
    .references((): AnyPgColumn => markets.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: warehouseKind("kind").notNull(),
  storeId: uuid("store_id"),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** chave primária composta: (warehouse_id, product_id) */
export const inventory = pgTable(
  "inventory",
  {
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references((): AnyPgColumn => warehouses.id),
    productId: uuid("product_id")
      .notNull()
      .references((): AnyPgColumn => products.id),
    onHand: numeric("on_hand", { precision: 14, scale: 3 }).notNull().default("0"),
    reserved: numeric("reserved", { precision: 14, scale: 3 }).notNull().default("0"),
    available: numeric("available", { precision: 14, scale: 3 }).generatedAlwaysAs(
      sql`(on_hand - reserved)`,
    ),
    minLevel: numeric("min_level", { precision: 14, scale: 3 }),
    maxLevel: numeric("max_level", { precision: 14, scale: 3 }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.warehouseId, t.productId] })],
);

/** FK composta: (warehouse_id, product_id) → inventory(warehouse_id, product_id) */
export const inventoryMovements = pgTable("inventory_movements", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  warehouseId: uuid("warehouse_id").notNull(),
  productId: uuid("product_id").notNull(),
  kind: movementKind("kind").notNull(),
  quantityDelta: numeric("quantity_delta", { precision: 14, scale: 3 }).notNull(),
  onHandAfter: numeric("on_hand_after", { precision: 14, scale: 3 }).notNull(),
  reference: text("reference"),
  transferId: uuid("transfer_id"),
  supplierId: uuid("supplier_id").references((): AnyPgColumn => suppliers.id),
  unitCostMinor: bigint("unit_cost_minor", { mode: "number" }),
  costCurrency: char("cost_currency", { length: 3 }).references((): AnyPgColumn => currencies.code),
  note: text("note"),
  idempotencyKey: text("idempotency_key"),
  createdBy: uuid("created_by")
    .default(sql`auth.uid()`)
    .references((): AnyPgColumn => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** FK composta: (warehouse_id, product_id) → inventory(warehouse_id, product_id) */
export const stockReservations = pgTable("stock_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  warehouseId: uuid("warehouse_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  reference: text("reference").notNull(),
  status: reservationStatus("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
});

// ─── Mídias ────────────────────────────────────────────────────────────────────

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucket: text("bucket").notNull().default("catalog"),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  width: integer("width"),
  height: integer("height"),
  sha256: text("sha256").notNull(),
  altText: text("alt_text"),
  status: mediaStatus("status").notNull().default("pending"),
  error: text("error"),
  createdBy: uuid("created_by")
    .default(sql`auth.uid()`)
    .references((): AnyPgColumn => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** chave primária composta: (asset_id, variant, format) */
export const mediaRenditions = pgTable(
  "media_renditions",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references((): AnyPgColumn => mediaAssets.id),
    variant: mediaVariant("variant").notNull(),
    format: mediaFormat("format").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    objectKey: text("object_key").notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.variant, t.format] })],
);

/** chave primária composta: (product_id, asset_id) */
export const productMedia = pgTable(
  "product_media",
  {
    productId: uuid("product_id")
      .notNull()
      .references((): AnyPgColumn => products.id),
    assetId: uuid("asset_id")
      .notNull()
      .references((): AnyPgColumn => mediaAssets.id),
    position: smallint("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.productId, t.assetId] })],
);

/** chave primária composta: (brand_id, asset_id) */
export const brandMedia = pgTable(
  "brand_media",
  {
    brandId: uuid("brand_id")
      .notNull()
      .references((): AnyPgColumn => brands.id),
    assetId: uuid("asset_id")
      .notNull()
      .references((): AnyPgColumn => mediaAssets.id),
    position: smallint("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.assetId] })],
);

/** chave primária composta: (category_id, asset_id) */
export const categoryMedia = pgTable(
  "category_media",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references((): AnyPgColumn => categories.id),
    assetId: uuid("asset_id")
      .notNull()
      .references((): AnyPgColumn => mediaAssets.id),
    position: smallint("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.assetId] })],
);

// ─── Comparador: observações de preço e ingestão ───────────────────────────────

export const priceObservations = pgTable("price_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references((): AnyPgColumn => stores.id),
  productId: uuid("product_id")
    .notNull()
    .references((): AnyPgColumn => products.id),
  priceCents: integer("price_cents").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  promo: boolean("promo").notNull().default(false),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
  validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
  observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  source: observationSource("source").notNull(),
  sourceId: uuid("source_id").references((): AnyPgColumn => sources.id),
  sourceRef: text("source_ref"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("1"),
  status: observationStatus("status").notNull().default("pending"),
  createdBy: uuid("created_by").references((): AnyPgColumn => profiles.id),
  approvedBy: uuid("approved_by").references((): AnyPgColumn => profiles.id),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  reviewedBy: uuid("reviewed_by").references((): AnyPgColumn => profiles.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
});

export const currentPrices = pgMaterializedView("current_prices", {
  storeId: uuid("store_id"),
  productId: uuid("product_id"),
  observationId: uuid("observation_id"),
  priceCents: integer("price_cents"),
  unitPriceCents: integer("unit_price_cents"),
  promo: boolean("promo"),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }),
  validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
  observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  source: observationSource("source"),
}).existing();

export const priceBoard = pgView("price_board", {
  storeId: uuid("store_id"),
  productId: uuid("product_id"),
  priceCents: integer("price_cents"),
  unitPriceCents: integer("unit_price_cents"),
  promo: boolean("promo"),
  validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
  observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  storeName: text("store_name"),
  cityId: uuid("city_id"),
  storeNeighborhood: text("store_neighborhood"),
  canonicalName: text("canonical_name"),
  brand: text("brand"),
  sizeValue: numeric("size_value", { precision: 12, scale: 3 }),
  sizeUnit: sizeUnit("size_unit"),
  baseUnit: baseUnit("base_unit"),
  categoryId: uuid("category_id"),
}).existing();

export const productAliases = pgTable("product_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").references((): AnyPgColumn => stores.id),
  rawName: text("raw_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  productId: uuid("product_id").references((): AnyPgColumn => products.id),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  status: aliasStatus("status").notNull().default("pending"),
  createdBy: uuid("created_by").references((): AnyPgColumn => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").references((): AnyPgColumn => stores.id),
  kind: sourceKind("kind").notNull(),
  filePath: text("file_path").notNull(),
  sha256: text("sha256").notNull(),
  periodStart: date("period_start", { mode: "string" }),
  periodEnd: date("period_end", { mode: "string" }),
  status: sourceStatus("status").notNull().default("uploaded"),
  error: text("error"),
  uploadedBy: uuid("uploaded_by").references((): AnyPgColumn => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const extractions = pgTable("extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .references((): AnyPgColumn => sources.id),
  model: text("model").notNull(),
  rawJson: jsonb("raw_json").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const reviewTasks = pgTable("review_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: reviewTarget("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(),
  payload: jsonb("payload"),
  assignedTo: uuid("assigned_to").references((): AnyPgColumn => profiles.id),
  status: reviewStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  resolvedBy: uuid("resolved_by").references((): AnyPgColumn => profiles.id),
});

// ─── Usuários, listas e contribuições ──────────────────────────────────────────

/** FK: id → users.id (outro schema) */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  role: userRole("role").notNull().default("user"),
  reputation: integer("reputation").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references((): AnyPgColumn => profiles.id),
  name: text("name").notNull().default("Minha lista"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const listItems = pgTable("list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id")
    .notNull()
    .references((): AnyPgColumn => shoppingLists.id),
  productId: uuid("product_id").references((): AnyPgColumn => products.id),
  freeText: text("free_text"),
  quantity: integer("quantity").notNull().default(1),
  checked: boolean("checked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const contributions = pgTable("contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references((): AnyPgColumn => profiles.id),
  observationId: uuid("observation_id")
    .notNull()
    .references((): AnyPgColumn => priceObservations.id),
  points: integer("points").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ─── Operação e auditoria ──────────────────────────────────────────────────────

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobName: text("job_name").notNull(),
  runKey: text("run_key"),
  status: jobRunStatus("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  affected: integer("affected"),
  error: text("error"),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actor: uuid("actor"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  diff: jsonb("diff"),
  at: timestamp("at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** Todas as tabelas: o teste `schema.integration.test.ts` confere cada uma contra o banco real. */
export const tables = {
  currencies,
  countries,
  regions,
  markets,
  cities,
  stores,
  categories,
  brands,
  productFamilies,
  products,
  productIdentifiers,
  attributeDefinitions,
  familyAttributeValues,
  allergens,
  familyAllergens,
  familyNutrition,
  priceLists,
  productPrices,
  promotions,
  promotionProducts,
  promotionRules,
  promotionScopes,
  promotionUsage,
  suppliers,
  supplierProducts,
  warehouses,
  inventory,
  inventoryMovements,
  stockReservations,
  mediaAssets,
  mediaRenditions,
  productMedia,
  brandMedia,
  categoryMedia,
  priceObservations,
  productAliases,
  sources,
  extractions,
  reviewTasks,
  profiles,
  shoppingLists,
  listItems,
  contributions,
  jobRuns,
  auditLog,
} as const;
/** Views e views materializadas. */
export const views = { productThumbnails, currentPrices, priceBoard } as const;
