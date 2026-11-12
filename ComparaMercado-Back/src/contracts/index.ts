/**
 * Contratos do Compara Mercado: a fronteira de comunicação entre front-end e back-end.
 *
 * Regras desta camada:
 *  - nada de nomes de colunas, tabelas ou clientes do banco (isso fica em `src/database` e nos `repository` dos módulos);
 *  - nada de regra de negócio (isso fica em `src/lib`);
 *  - os schemas são a fonte única: o back-end valida o que recebe e o front-end valida o que lê;
 *  - toda mudança incompatível exige nova versão maior do contrato (`CONTRACT_VERSION`).
 */
import { z } from "zod";

/** Versão do contrato. Suba a maior em mudanças incompatíveis. */
export const CONTRACT_VERSION = "3.1.0";

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
  /** Foto da etiqueta de um envio (bytes JPEG), só para o admin que revisa. */
  adminObservationPhoto: (observationId: string) => `/v1/admin/observations/${observationId}/photo`,
  /** Envio de preço com foto (multipart) por usuário logado. */
  contributions: "/v1/contributions",
  myContributions: "/v1/me/contributions",
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

/** Tamanho de página padrão das listagens (e o máximo que a API aceita). */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Paginação numerada: `page` começa em 1; `pageSize` é limitado para proteger o banco. */
const PageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
const PageSizeSchema = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);

/** Parte comum de toda resposta paginada: `total` é a contagem com os filtros aplicados. */
const PageInfoShape = {
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
};

export const SearchProductsQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  page: PageSchema,
  pageSize: PageSizeSchema,
  /** Só produtos com preço vigente em algum mercado (`1`/`true`). */
  onlyPriced: z.stringbool().default(false),
});
export type SearchProductsQuery = z.infer<typeof SearchProductsQuerySchema>;

export const SearchProductsResponseSchema = z.object({
  hits: z.array(ProductHitSchema),
  ...PageInfoShape,
});
export type SearchProductsResponse = z.infer<typeof SearchProductsResponseSchema>;

export const ProductDetailsSchema = z.object({
  product: ProductSchema,
  prices: z.array(PriceOfferSchema),
  history: z.array(PricePointSchema),
});
export type ProductDetails = z.infer<typeof ProductDetailsSchema>;

/** Ordenação das ofertas: destaque (relevância com busca; senão, a que vence primeiro), etc. */
export const OffersSortSchema = z.enum(["featured", "price", "validity", "recent"]);
export type OffersSort = z.infer<typeof OffersSortSchema>;

export const OffersQuerySchema = z.object({
  storeId: z.uuid().optional(),
  /** Busca por produto, marca ou mercado (sem acento, tolera erro de digitação). */
  q: z.string().trim().max(80).optional(),
  sort: OffersSortSchema.default("featured"),
  /** Só as que vencem em até 3 dias (`1`/`true`). */
  expiring: z.stringbool().default(false),
  page: PageSchema,
  pageSize: PageSizeSchema,
});
export type OffersQuery = z.infer<typeof OffersQuerySchema>;

export const OffersResponseSchema = z.object({
  offers: z.array(PriceOfferSchema),
  ...PageInfoShape,
});
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
  /** Confiança da leitura automática; 0 em envios feitos por pessoas (ainda não avaliados). */
  confidence: z.number().nullable(),
  priceCents: z.number().int(),
  /** Existe foto da etiqueta para conferir (busque os bytes em `adminObservationPhoto`). */
  hasPhoto: z.boolean(),
  createdAt: z.string(),
});
export type PendingObservation = z.infer<typeof PendingObservationSchema>;

export const ReviewQueueQuerySchema = z.object({ page: PageSchema, pageSize: PageSizeSchema });
export type ReviewQueueQuery = z.infer<typeof ReviewQueueQuerySchema>;

export const ReviewQueueResponseSchema = z.object({
  observations: z.array(PendingObservationSchema),
  ...PageInfoShape,
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

// ── Contribuição de preços com foto (usuário logado) ───────────────────────────────────────────

/** Teto do arquivo da foto. O navegador já comprime (~1,5 MB); o resto é folga. */
export const MAX_CONTRIBUTION_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Campos de texto do envio (multipart: tudo chega como string; a foto vai no campo `photo`).
 * O preço máximo é de supermercado: acima disso quase certamente é erro de digitação.
 */
export const ContributionFieldsSchema = z.object({
  storeId: z.uuid(),
  productId: z.uuid(),
  priceCents: z.coerce.number().int().min(1).max(1_000_000),
  promo: z.stringbool().default(false),
});
export type ContributionFields = z.infer<typeof ContributionFieldsSchema>;

export const ContributionCreatedSchema = z.object({
  id: z.uuid(),
  status: z.literal("pending"),
});
export type ContributionCreated = z.infer<typeof ContributionCreatedSchema>;

export const ContributionStatusSchema = z.enum(["pending", "approved", "rejected", "superseded"]);
export type ContributionStatus = z.infer<typeof ContributionStatusSchema>;

/** Um envio do próprio usuário, com o andamento da análise. */
export const MyContributionSchema = z.object({
  id: z.uuid(),
  productName: z.string().nullable(),
  storeName: z.string().nullable(),
  priceCents: z.number().int(),
  promo: z.boolean(),
  status: ContributionStatusSchema,
  createdAt: z.string(),
});
export type MyContribution = z.infer<typeof MyContributionSchema>;

export const MyContributionsQuerySchema = z.object({ page: PageSchema, pageSize: PageSizeSchema });
export type MyContributionsQuery = z.infer<typeof MyContributionsQuerySchema>;

export const MyContributionsResponseSchema = z.object({
  contributions: z.array(MyContributionSchema),
  ...PageInfoShape,
});
export type MyContributionsResponse = z.infer<typeof MyContributionsResponseSchema>;

// ── Erros e envelopes ──────────────────────────────────────────────────────────────────────────

/** Formato único de erro da API; `message` é seguro para exibir ao usuário. */
export const ApiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** Envelope padrão de resposta das ações do front-end: sucesso com dados ou erro legível. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
