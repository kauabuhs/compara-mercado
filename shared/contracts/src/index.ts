/**
 * Contratos do Compara Mercado: a fronteira de comunicação entre front-end e back-end.
 *
 * Regras desta camada:
 *  - nada de nomes de colunas, tabelas ou clientes do banco (isso fica em `backend/packages/db`);
 *  - nada de regra de negócio (isso fica em `backend/packages/domain`);
 *  - os schemas são a fonte única: o back-end valida o que recebe e o front-end valida o que lê;
 *  - toda mudança incompatível exige nova versão maior do contrato (`CONTRACT_VERSION`).
 */
import { z } from "zod";

/** Versão do contrato. Suba a maior em mudanças incompatíveis. */
export const CONTRACT_VERSION = "2.0.0";

// ── Rotas da API (v1) ──────────────────────────────────────────────────────────────────────────

export const apiRoutes = {
  health: "/healthz",
  searchProducts: "/v1/products/search",
  productDetails: (productId: string) => `/v1/products/${productId}`,
  offers: "/v1/offers",
  stores: "/v1/stores",
  compareList: "/v1/shopping-lists/compare",
  currentUser: "/v1/me",
  adminOverview: "/v1/admin/overview",
  adminPriceFormOptions: "/v1/admin/price-form-options",
  adminReviewQueue: "/v1/admin/review-queue",
  adminCreatePrice: "/v1/admin/prices",
  adminReviewObservation: (observationId: string) =>
    `/v1/admin/observations/${observationId}/review`,
} as const;

// ── Tipos primitivos ───────────────────────────────────────────────────────────────────────────

export const SizeUnitSchema = z.enum(["g", "kg", "ml", "l", "un"]);
export type SizeUnit = z.infer<typeof SizeUnitSchema>;

export const BaseUnitSchema = z.enum(["kg", "l", "un"]);
export type BaseUnit = z.infer<typeof BaseUnitSchema>;

/** Classificação de frescor do preço, decidida pelo back-end (7 e 14 dias hoje). */
export const FreshnessSchema = z.enum(["fresh", "recent", "stale"]);
export type Freshness = z.infer<typeof FreshnessSchema>;

// ── Modelos de leitura ─────────────────────────────────────────────────────────────────────────

/** Resultado de busca de produto. */
export const ProductHitSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  sizeValue: z.number(),
  sizeUnit: SizeUnitSchema,
  baseUnit: BaseUnitSchema,
  categoryId: z.uuid().nullable(),
  /** Similaridade com o termo buscado (0 a 1). */
  score: z.number(),
  minUnitPriceCents: z.number().int().nullable(),
  storeCount: z.number().int(),
});
export type ProductHit = z.infer<typeof ProductHitSchema>;

export const ProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  sizeValue: z.number(),
  sizeUnit: SizeUnitSchema,
  baseUnit: BaseUnitSchema,
  categoryId: z.uuid().nullable(),
});
export type Product = z.infer<typeof ProductSchema>;

/** Preço vigente de um produto em um mercado, ainda sem a classificação de frescor. */
export const PriceOfferBaseSchema = z.object({
  storeId: z.uuid(),
  productId: z.uuid(),
  priceCents: z.number().int(),
  unitPriceCents: z.number().int(),
  promo: z.boolean(),
  validTo: z.string().nullable(),
  observedAt: z.string(),
  storeName: z.string(),
  storeNeighborhood: z.string().nullable(),
  productName: z.string(),
  brand: z.string().nullable(),
  sizeValue: z.number(),
  sizeUnit: SizeUnitSchema,
  baseUnit: BaseUnitSchema,
  categoryId: z.uuid().nullable(),
});
export type PriceOfferBase = z.infer<typeof PriceOfferBaseSchema>;

/** Preço vigente com a idade e o frescor calculados pelo back-end no momento da resposta. */
export const PriceOfferSchema = PriceOfferBaseSchema.extend({
  ageDays: z.number().int().min(0),
  freshness: FreshnessSchema,
});
export type PriceOffer = z.infer<typeof PriceOfferSchema>;

export const StoreSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  neighborhood: z.string().nullable(),
  openingHours: z.record(z.string(), z.unknown()).nullable(),
  cityId: z.uuid(),
  lat: z.number(),
  lng: z.number(),
});
export type Store = z.infer<typeof StoreSchema>;

export const PricePointSchema = z.object({
  storeId: z.uuid(),
  priceCents: z.number().int(),
  unitPriceCents: z.number().int(),
  promo: z.boolean(),
  observedAt: z.string(),
});
export type PricePoint = z.infer<typeof PricePointSchema>;

export const StoreTotalSchema = z.object({
  storeId: z.uuid(),
  name: z.string(),
  totalCents: z.number().int(),
  foundCount: z.number().int(),
  missingProductIds: z.array(z.uuid()),
  complete: z.boolean(),
  distanceMeters: z.number().nullable(),
});
export type StoreTotal = z.infer<typeof StoreTotalSchema>;

export const SplitPlanSchema = z.object({
  storeIds: z.tuple([z.uuid(), z.uuid()]),
  totalCents: z.number().int(),
  savingsCents: z.number().int(),
  extraDistanceMeters: z.number().nullable(),
  missingProductIds: z.array(z.uuid()),
  assignments: z.array(
    z.object({
      productId: z.uuid(),
      storeId: z.uuid(),
      priceCents: z.number().int(),
      quantity: z.number().int(),
    }),
  ),
});
export type SplitPlan = z.infer<typeof SplitPlanSchema>;

/** Comparação de uma lista de compras entre mercados. */
export const ListComparisonSchema = z.object({
  stores: z.array(StoreTotalSchema),
  bestSingle: StoreTotalSchema.nullable(),
  bestSplit: SplitPlanSchema.nullable(),
});
export type ListComparison = z.infer<typeof ListComparisonSchema>;

// ── Catálogo, ofertas e mercados (públicos) ────────────────────────────────────────────────────

export const SearchProductsQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type SearchProductsQuery = z.infer<typeof SearchProductsQuerySchema>;

export const SearchProductsResponseSchema = z.object({ hits: z.array(ProductHitSchema) });
export type SearchProductsResponse = z.infer<typeof SearchProductsResponseSchema>;

export const ProductDetailsSchema = z.object({
  product: ProductSchema,
  prices: z.array(PriceOfferSchema),
  history: z.array(PricePointSchema),
});
export type ProductDetails = z.infer<typeof ProductDetailsSchema>;

export const OffersQuerySchema = z.object({
  storeId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});
export type OffersQuery = z.infer<typeof OffersQuerySchema>;

export const OffersResponseSchema = z.object({ offers: z.array(PriceOfferSchema) });
export type OffersResponse = z.infer<typeof OffersResponseSchema>;

export const StoresQuerySchema = z.object({ cityId: z.uuid().optional() });
export type StoresQuery = z.infer<typeof StoresQuerySchema>;

export const StoresResponseSchema = z.object({ stores: z.array(StoreSchema) });
export type StoresResponse = z.infer<typeof StoresResponseSchema>;

/** Entrada de "comparar lista". A localização é usada só na consulta e nunca é gravada. */
export const CompareListRequestSchema = z.object({
  items: z
    .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(99) }))
    .min(1)
    .max(100),
  where: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .optional(),
});
export type CompareListRequest = z.infer<typeof CompareListRequestSchema>;

// ── Sessão e administração (exigem token) ──────────────────────────────────────────────────────

export const UserRoleSchema = z.enum(["user", "contributor", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const SessionUserSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  role: UserRoleSchema,
  displayName: z.string().nullable(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const AdminOverviewSchema = z.object({
  pendingReviews: z.number().int().min(0),
  activeStores: z.number().int().min(0),
  activeProducts: z.number().int().min(0),
  currentPrices: z.number().int().min(0),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;

export const PriceFormOptionsSchema = z.object({
  stores: z.array(z.object({ id: z.uuid(), name: z.string() })),
  products: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      brand: z.string().nullable(),
      sizeValue: z.number(),
      sizeUnit: SizeUnitSchema,
    }),
  ),
});
export type PriceFormOptions = z.infer<typeof PriceFormOptionsSchema>;

export const PendingObservationSchema = z.object({
  id: z.uuid(),
  productName: z.string().nullable(),
  storeName: z.string().nullable(),
  source: z.string(),
  confidence: z.number().nullable(),
  priceCents: z.number().int(),
});
export type PendingObservation = z.infer<typeof PendingObservationSchema>;

export const ReviewQueueResponseSchema = z.object({
  observations: z.array(PendingObservationSchema),
});
export type ReviewQueueResponse = z.infer<typeof ReviewQueueResponseSchema>;

/** Preço lançado manualmente por um admin. Valor sempre em centavos inteiros. */
export const ManualPriceRequestSchema = z.object({
  storeId: z.uuid(),
  productId: z.uuid(),
  priceCents: z.number().int().min(1).max(99_999_999),
  promo: z.boolean(),
  /** Último dia de validade da oferta (AAAA-MM-DD). */
  validTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ManualPriceRequest = z.infer<typeof ManualPriceRequestSchema>;

export const ReviewDecisionSchema = z.enum(["approved", "rejected"]);
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const ReviewObservationRequestSchema = z.object({ decision: ReviewDecisionSchema });
export type ReviewObservationRequest = z.infer<typeof ReviewObservationRequestSchema>;

// ── Erros e envelopes ──────────────────────────────────────────────────────────────────────────

/** Formato único de erro da API; `message` é seguro para exibir ao usuário. */
export const ApiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** Envelope padrão de resposta das ações do front-end: sucesso com dados ou erro legível. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
