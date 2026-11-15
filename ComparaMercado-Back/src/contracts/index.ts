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
export const CONTRACT_VERSION = "3.8.0";

// ── Rotas da API (v1) ──────────────────────────────────────────────────────────────────────────

export const apiRoutes = {
  health: "/healthz",
  searchProducts: "/v1/products/search",
  productDetails: (productId: string) => `/v1/products/${productId}`,
  offers: "/v1/offers",
  stores: "/v1/stores",
  compareList: "/v1/shopping-lists/compare",
  currentUser: "/v1/me",
  /** Dados da própria conta (nome, telefone, cidade): leitura e edição parcial. */
  myProfile: "/v1/me/profile",
  /** Cidades habilitadas no comparador (para escolher a cidade preferida). */
  cities: "/v1/cities",
  /** Biblioteca de cidades (municípios do IBGE): busca por nome, sem acento e tolerante a erro. */
  citySearch: "/v1/cities/search",
  /** Uma cidade da biblioteca, com a cobertura de mercados. */
  city: (cityId: string) => `/v1/cities/${cityId}`,
  adminOverview: "/v1/admin/overview",
  adminPriceFormOptions: "/v1/admin/price-form-options",
  adminReviewQueue: "/v1/admin/review-queue",
  adminCreatePrice: "/v1/admin/prices",
  adminReviewObservation: (observationId: string) =>
    `/v1/admin/observations/${observationId}/review`,
  /** Foto da etiqueta de um envio (bytes JPEG), só para o admin que revisa. */
  adminObservationPhoto: (observationId: string) => `/v1/admin/observations/${observationId}/photo`,
  /** Fila de moderação (denúncias e contestações da comunidade) e a decisão sobre cada tarefa. */
  adminModeration: "/v1/admin/moderation",
  adminModerationTask: (taskId: string) => `/v1/admin/moderation/${taskId}`,
  /** Cadastro-base (admin): GET lista paginada e POST cria; PATCH em `…/:id` edita ou arquiva. */
  adminCities: "/v1/admin/cities",
  adminCity: (cityId: string) => `/v1/admin/cities/${cityId}`,
  adminStores: "/v1/admin/stores",
  adminStore: (storeId: string) => `/v1/admin/stores/${storeId}`,
  adminCategories: "/v1/admin/categories",
  adminCategory: (categoryId: string) => `/v1/admin/categories/${categoryId}`,
  adminProducts: "/v1/admin/products",
  adminProduct: (productId: string) => `/v1/admin/products/${productId}`,
  /** Envio de preço com foto (multipart) por usuário logado. */
  contributions: "/v1/contributions",
  myContributions: "/v1/me/contributions",
  /** Feed de preços e promoções da comunidade, por cidade (leitura pública). */
  communityFeed: "/v1/community/feed",
  /** "Ainda está assim" / "Mudou" numa publicação. */
  communityConfirm: (observationId: string) =>
    `/v1/community/observations/${observationId}/confirmations`,
  /** Denúncia de uma publicação. */
  communityReport: (observationId: string) => `/v1/community/observations/${observationId}/reports`,
  /** Foto da etiqueta de uma publicação visível no feed (bytes JPEG), só para quem está logado. */
  communityPhoto: (observationId: string) => `/v1/community/observations/${observationId}/photo`,
  /** Reputação e histórico de pontos do próprio usuário. */
  myReputation: "/v1/me/reputation",
  /** Sincroniza a lista de compras do aparelho com a da conta (uma lista por pessoa). */
  syncMyList: "/v1/me/list/sync",
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
  /** Tarefas de moderação abertas (preços denunciados ou contestados pela comunidade). */
  openModerationTasks: z.number().int().min(0),
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

/** Tamanho do motivo da rejeição (o banco confere o mesmo intervalo). */
export const REVIEW_NOTE_MIN = 3;
export const REVIEW_NOTE_MAX = 200;
export const ReviewNoteSchema = z.string().trim().min(REVIEW_NOTE_MIN).max(REVIEW_NOTE_MAX);

/** `note` explica a rejeição a quem enviou o preço; é ignorada na aprovação. */
export const ReviewObservationRequestSchema = z.object({
  decision: ReviewDecisionSchema,
  note: ReviewNoteSchema.optional(),
});
export type ReviewObservationRequest = z.infer<typeof ReviewObservationRequestSchema>;

// ── Cadastro-base (admin): cidades, mercados, categorias e produtos ────────────────────────────
//
// Nada é apagado: "excluir" é desativar (cidade/mercado) ou arquivar (produto), porque as
// observações de preço são imutáveis e guardam referência a essas linhas.

/** Listagem do cadastro: busca por nome, filtro de situação e paginação numerada. */
export const AdminListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  /** `inactive` = cidades desativadas, mercados inativos/pendentes e produtos arquivados. */
  situation: z.enum(["active", "inactive"]).optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;

/** Impede um PATCH vazio (não há o que gravar). */
const hasAnyField = (value: object) => Object.values(value).some((field) => field !== undefined);
const EMPTY_PATCH_MESSAGE = "Informe ao menos um campo para alterar.";

const requiredName = z.string().trim().min(2).max(120);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

// Cidades

export const AdminCitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  uf: z.string().nullable(),
  ibgeCode: z.string().nullable(),
  /** Habilitada no comparador (aparece para as pessoas escolherem). */
  active: z.boolean(),
});
export type AdminCity = z.infer<typeof AdminCitySchema>;

export const CreateCityRequestSchema = z.object({
  name: requiredName,
  uf: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((uf) => uf.toUpperCase()),
  /** Código do IBGE (7 dígitos): identifica a cidade e evita duplicidade. */
  ibgeCode: z.string().regex(/^\d{7}$/),
  active: z.boolean().default(false),
});
export type CreateCityRequest = z.infer<typeof CreateCityRequestSchema>;

export const UpdateCityRequestSchema = z
  .object({ name: requiredName.optional(), active: z.boolean().optional() })
  .refine(hasAnyField, EMPTY_PATCH_MESSAGE);
export type UpdateCityRequest = z.infer<typeof UpdateCityRequestSchema>;

export const AdminCityListSchema = z.object({ items: z.array(AdminCitySchema), ...PageInfoShape });
export type AdminCityList = z.infer<typeof AdminCityListSchema>;

// Mercados (lojas)

export const StoreStatusSchema = z.enum(["pending", "active", "inactive"]);
export type StoreStatus = z.infer<typeof StoreStatusSchema>;

export const AdminStoreSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  cityId: z.uuid(),
  cityName: z.string().nullable(),
  cnpj: z.string().nullable(),
  address: z.string().nullable(),
  neighborhood: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  status: StoreStatusSchema,
});
export type AdminStore = z.infer<typeof AdminStoreSchema>;

const storeFields = {
  name: requiredName,
  cityId: z.uuid(),
  /** 14 dígitos, sem pontuação. */
  cnpj: z
    .string()
    .regex(/^\d{14}$/)
    .nullable(),
  address: optionalText(200),
  neighborhood: optionalText(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  status: StoreStatusSchema,
};

export const CreateStoreRequestSchema = z.object({
  ...storeFields,
  cnpj: storeFields.cnpj.default(null),
  address: storeFields.address.default(null),
  neighborhood: storeFields.neighborhood.default(null),
  /** Quem cadastra um mercado já o quer visível; use `pending` para deixar em preparação. */
  status: StoreStatusSchema.default("active"),
});
export type CreateStoreRequest = z.infer<typeof CreateStoreRequestSchema>;

export const UpdateStoreRequestSchema = z
  .object({
    name: storeFields.name.optional(),
    cityId: storeFields.cityId.optional(),
    cnpj: storeFields.cnpj.optional(),
    address: storeFields.address.optional(),
    neighborhood: storeFields.neighborhood.optional(),
    lat: storeFields.lat.optional(),
    lng: storeFields.lng.optional(),
    status: storeFields.status.optional(),
  })
  // a posição é gravada como um ponto só: as duas coordenadas andam juntas
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: "Informe latitude e longitude juntas.",
  })
  .refine(hasAnyField, EMPTY_PATCH_MESSAGE);
export type UpdateStoreRequest = z.infer<typeof UpdateStoreRequestSchema>;

export const AdminStoreListSchema = z.object({
  items: z.array(AdminStoreSchema),
  ...PageInfoShape,
});
export type AdminStoreList = z.infer<typeof AdminStoreListSchema>;

// Categorias

export const AdminCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  parentId: z.uuid().nullable(),
});
export type AdminCategory = z.infer<typeof AdminCategorySchema>;

export const CreateCategoryRequestSchema = z.object({
  name: requiredName,
  /** Endereço curto e estável (minúsculas, números e hífen). Não muda depois de criado. */
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  parentId: z.uuid().nullable().default(null),
});
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;

export const UpdateCategoryRequestSchema = z
  .object({ name: requiredName.optional(), parentId: z.uuid().nullable().optional() })
  .refine(hasAnyField, EMPTY_PATCH_MESSAGE);
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequestSchema>;

export const AdminCategoryListSchema = z.object({
  items: z.array(AdminCategorySchema),
  ...PageInfoShape,
});
export type AdminCategoryList = z.infer<typeof AdminCategoryListSchema>;

// Produtos

/** `draft` = em preparação (não aparece ao público); `archived` = fora do catálogo. */
export const ProductStatusSchema = z.enum(["active", "draft", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const AdminProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  gtin: z.string().nullable(),
  sizeValue: z.number(),
  sizeUnit: SizeUnitSchema,
  status: ProductStatusSchema,
});
export type AdminProduct = z.infer<typeof AdminProductSchema>;

const productFields = {
  name: requiredName,
  brand: z.string().trim().min(1).max(80),
  categoryId: z.uuid(),
  /** Código de barras (GTIN-8/12/13/14). O dígito verificador é conferido pelo back-end. */
  gtin: z
    .string()
    .trim()
    .regex(/^\d{8}$|^\d{12,14}$/),
  sizeValue: z.number().positive().max(999_999),
  sizeUnit: SizeUnitSchema,
};

export const CreateProductRequestSchema = z.object({
  name: productFields.name,
  brand: productFields.brand.nullable().default(null),
  categoryId: productFields.categoryId.nullable().default(null),
  gtin: productFields.gtin.nullable().default(null),
  sizeValue: productFields.sizeValue,
  sizeUnit: productFields.sizeUnit,
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

/**
 * Edição parcial. A marca não entra: pertence à família do produto (e a outros produtos dela), então
 * é corrigida pelo cadastro de marcas, não por um produto isolado.
 */
export const UpdateProductRequestSchema = z
  .object({
    name: productFields.name.optional(),
    categoryId: productFields.categoryId.nullable().optional(),
    gtin: productFields.gtin.nullable().optional(),
    sizeValue: productFields.sizeValue.optional(),
    sizeUnit: productFields.sizeUnit.optional(),
    status: ProductStatusSchema.optional(),
  })
  .refine(hasAnyField, EMPTY_PATCH_MESSAGE);
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const AdminProductListSchema = z.object({
  items: z.array(AdminProductSchema),
  ...PageInfoShape,
});
export type AdminProductList = z.infer<typeof AdminProductListSchema>;

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
  /** Por que o envio foi rejeitado (só quando `status` é `rejected` e o admin explicou). */
  reviewNote: z.string().nullable(),
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

// ── Conta: perfil e cidades ────────────────────────────────────────────────────────────────────

/** Cidade habilitada no comparador. */
export const CitySchema = z.object({ id: z.uuid(), name: z.string(), uf: z.string() });
export type City = z.infer<typeof CitySchema>;

export const CitiesResponseSchema = z.object({ cities: z.array(CitySchema) });
export type CitiesResponse = z.infer<typeof CitiesResponseSchema>;

/**
 * Cobertura de uma cidade da biblioteca: `available` tem ao menos um mercado ativo;
 * `coming_soon` existe na biblioteca mas ainda não tem mercados (ADR-0014).
 */
export const CityCoverageSchema = z.enum(["available", "coming_soon"]);
export type CityCoverage = z.infer<typeof CityCoverageSchema>;

/** Cidade da biblioteca (qualquer município), com a cobertura e o centro para o mapa. */
export const CityDetailSchema = CitySchema.extend({
  ibgeCode: z.string().nullable(),
  /** Mercados ativos na cidade. */
  storeCount: z.number().int().min(0),
  coverage: CityCoverageSchema,
  /** Centro da cidade para o mapa; `null` até ser preenchido. */
  centerLat: z.number().nullable(),
  centerLng: z.number().nullable(),
});
export type CityDetail = z.infer<typeof CityDetailSchema>;

export const CITY_SEARCH_MAX_QUERY = 80;
export const CITY_SEARCH_DEFAULT_LIMIT = 20;
export const CITY_SEARCH_MAX_LIMIT = 50;

/**
 * Busca na biblioteca de cidades. Sem `q` (ou com menos de 2 letras) devolve as cidades que já
 * têm mercados; com `uf` e sem `q`, todas as cidades da UF.
 */
export const CitySearchQuerySchema = z.object({
  q: z.string().trim().max(CITY_SEARCH_MAX_QUERY).default(""),
  uf: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((uf) => uf.toUpperCase())
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CITY_SEARCH_MAX_LIMIT)
    .default(CITY_SEARCH_DEFAULT_LIMIT),
});
export type CitySearchQuery = z.infer<typeof CitySearchQuerySchema>;

export const CitySearchResponseSchema = z.object({ cities: z.array(CityDetailSchema) });
export type CitySearchResponse = z.infer<typeof CitySearchResponseSchema>;

/** Limites do nome de exibição (espelham o `check` da coluna `profiles.display_name`). */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

/**
 * Apelido público (o que as outras pessoas veem no feed da comunidade; `displayName` pode ser o
 * nome real e nunca é exibido). Espelha o `check` de `profiles.public_nickname`.
 */
export const PUBLIC_NICKNAME_MIN = 2;
export const PUBLIC_NICKNAME_MAX = 24;
export const PUBLIC_NICKNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

/**
 * Dados pessoais da conta, só do próprio usuário. Mínimos de propósito (LGPD): sem CPF, data de
 * nascimento ou endereço. `termsVersion`/`termsAcceptedAt` são só leitura (gravados no cadastro).
 */
export const ProfileSchema = z.object({
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  /** Apelido exibido no feed da comunidade; `null` = "Colaborador #XXXX". */
  publicNickname: z.string().nullable(),
  /** Telefone em E.164 (`+5554999990000`); opcional. */
  phone: z.string().nullable(),
  cityId: z.uuid().nullable(),
  termsVersion: z.string().nullable(),
  termsAcceptedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * Edição parcial: só os campos enviados mudam; `null` apaga o dado. O telefone chega como o
 * usuário digitou (a API normaliza para E.164 e recusa o que não for um número válido).
 */
export const UpdateProfileRequestSchema = z
  .strictObject({
    displayName: z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX).nullable(),
    publicNickname: z
      .string()
      .trim()
      .min(PUBLIC_NICKNAME_MIN)
      .max(PUBLIC_NICKNAME_MAX)
      .regex(PUBLIC_NICKNAME_PATTERN)
      .nullable(),
    phone: z.string().trim().max(32).nullable(),
    cityId: z.uuid().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nenhum campo para atualizar." });
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

// ── Comunidade: feed, confirmações, denúncias e reputação (ADR-0010) ───────────────────────────

export const FEED_PAGE_SIZE_DEFAULT = 20;
/**
 * 49 e não 50: o serviço pede `limit + 1` linhas para saber se há próxima página, e a função SQL
 * `list_community_feed` devolve no máximo 50. Com 50 a linha extra nunca chegaria e a página 2
 * não apareceria.
 */
export const FEED_PAGE_SIZE_MAX = 49;

/** De onde veio o preço: pessoas da comunidade, encarte lido por IA, o próprio mercado ou a equipe. */
export const FeedOriginSchema = z.enum(["community", "flyer", "store", "team"]);
export type FeedOrigin = z.infer<typeof FeedOriginSchema>;

/**
 * Selo de confiança que a tela mostra: `official` (publicado pelo mercado), `confirmed` (aprovado
 * pela comunidade, por um autor de confiança, pelo pipeline ou pelo admin) e `unconfirmed`
 * (aguardando confirmações).
 */
export const FeedTrustSchema = z.enum(["official", "confirmed", "unconfirmed"]);
export type FeedTrust = z.infer<typeof FeedTrustSchema>;

export const ConfirmationVerdictSchema = z.enum(["confirm", "changed"]);
export type ConfirmationVerdict = z.infer<typeof ConfirmationVerdictSchema>;

export const ReportReasonSchema = z.enum([
  "wrong_price",
  "wrong_product",
  "wrong_store",
  "spam",
  "inappropriate_photo",
  "other",
]);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

/** 0 Novato · 1 Colaborador · 2 Confiável · 3 Guardião (faixas em `lib/reputation.ts`). */
export const ReputationLevelSchema = z.number().int().min(0).max(3);

/**
 * Uma publicação do feed. Nunca traz identidade do autor: só o apelido público (ou
 * "Colaborador #XXXX") e o nível.
 */
export const FeedItemSchema = z.object({
  id: z.uuid(),
  /** Quando foi publicada (ISO 8601, UTC). A tela mostra "há 12 min". */
  createdAt: z.string(),
  store: z.object({
    id: z.uuid(),
    name: z.string(),
    neighborhood: z.string().nullable(),
  }),
  /** Distância em metros até a posição informada na consulta; `null` sem posição. */
  distanceM: z.number().int().nullable(),
  product: z.object({
    id: z.uuid(),
    name: z.string(),
    brand: z.string().nullable(),
    sizeValue: z.number(),
    sizeUnit: SizeUnitSchema,
    baseUnit: BaseUnitSchema,
  }),
  priceCents: z.number().int(),
  unitPriceCents: z.number().int(),
  promo: z.boolean(),
  validTo: z.string().nullable(),
  origin: FeedOriginSchema,
  trust: FeedTrustSchema,
  confirmCount: z.number().int().min(0),
  changedCount: z.number().int().min(0),
  hasPhoto: z.boolean(),
  author: z.object({ label: z.string(), level: ReputationLevelSchema.nullable() }),
  isMine: z.boolean(),
  /** Voto do usuário que consulta (se logado e se já votou). */
  myVerdict: ConfirmationVerdictSchema.nullable(),
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

/** `?lat=` (vazio) chegaria como `""`, que `z.coerce.number()` transforma em 0: trata como ausente. */
const emptyAsUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

export const CommunityFeedQuerySchema = z
  .object({
    cityId: z.uuid(),
    /** Posição do aparelho (opcional): calcula distâncias e permite filtrar por raio. Nunca é gravada. */
    lat: emptyAsUndefined(z.coerce.number().min(-90).max(90).optional()),
    lng: emptyAsUndefined(z.coerce.number().min(-180).max(180).optional()),
    radiusM: emptyAsUndefined(z.coerce.number().int().min(100).max(50_000).optional()),
    /** Só promoções (`1`/`true`). */
    promo: z.stringbool().default(false),
    /** Cursor opaco devolvido em `nextCursor`; ausente = primeira página. */
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(FEED_PAGE_SIZE_MAX).default(FEED_PAGE_SIZE_DEFAULT),
  })
  .refine((query) => (query.lat === undefined) === (query.lng === undefined), {
    message: "Informe latitude e longitude juntas.",
  })
  .refine((query) => query.radiusM === undefined || query.lat !== undefined, {
    message: "O raio exige a posição.",
  });
export type CommunityFeedQuery = z.infer<typeof CommunityFeedQuerySchema>;

export const CommunityFeedResponseSchema = z.object({
  items: z.array(FeedItemSchema),
  /** Cursor da próxima página; `null` quando acabou. */
  nextCursor: z.string().nullable(),
});
export type CommunityFeedResponse = z.infer<typeof CommunityFeedResponseSchema>;

export const ConfirmObservationRequestSchema = z.strictObject({
  verdict: ConfirmationVerdictSchema,
});
export type ConfirmObservationRequest = z.infer<typeof ConfirmObservationRequestSchema>;

export const ConfirmObservationResponseSchema = z.object({
  /** `approved` quando esta confirmação completou a corroboração. */
  status: z.enum(["pending", "approved"]),
  confirmCount: z.number().int().min(0),
  changedCount: z.number().int().min(0),
});
export type ConfirmObservationResponse = z.infer<typeof ConfirmObservationResponseSchema>;

export const ReportObservationRequestSchema = z.strictObject({ reason: ReportReasonSchema });
export type ReportObservationRequest = z.infer<typeof ReportObservationRequestSchema>;

export const ReputationEventKindSchema = z.enum([
  "price_approved",
  "price_rejected",
  "confirmation_received",
  "confirmation_given",
]);
export type ReputationEventKind = z.infer<typeof ReputationEventKindSchema>;

export const ReputationSchema = z.object({
  points: z.number().int().min(0),
  level: ReputationLevelSchema,
  /** Pontos para o próximo nível; `null` no nível máximo. */
  nextLevelAt: z.number().int().nullable(),
  /** Últimos eventos (mais recentes primeiro). */
  events: z.array(
    z.object({
      kind: ReputationEventKindSchema,
      points: z.number().int(),
      createdAt: z.string(),
    }),
  ),
});
export type Reputation = z.infer<typeof ReputationSchema>;

// ── Erros e envelopes ──────────────────────────────────────────────────────────────────────────

/** Formato único de erro da API; `message` é seguro para exibir ao usuário. */
export const ApiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** Envelope padrão de resposta das ações do front-end: sucesso com dados ou erro legível. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Moderação (admin): preços denunciados ou contestados ───────────────────────────────────────

/** Uma tarefa aberta de moderação sobre um preço da comunidade. */
export const ModerationItemSchema = z.object({
  taskId: z.uuid(),
  observationId: z.uuid(),
  /** Por que a tarefa existe ("Denunciada pela comunidade", "Contestada pela comunidade"). */
  reason: z.string(),
  /** Situação atual do preço: `approved` = já está publicado; `pending` = ainda não. */
  status: ContributionStatusSchema,
  productName: z.string().nullable(),
  storeName: z.string().nullable(),
  priceCents: z.number().int(),
  promo: z.boolean(),
  /** Existe foto da etiqueta (busque os bytes em `adminObservationPhoto`). */
  hasPhoto: z.boolean(),
  /** Quantas pessoas denunciaram e por qual motivo. */
  reports: z.array(z.object({ reason: ReportReasonSchema, count: z.number().int().min(1) })),
  /** Quantas pessoas disseram "mudou". */
  changes: z.number().int().min(0),
  createdAt: z.string(),
});
export type ModerationItem = z.infer<typeof ModerationItemSchema>;

export const ModerationQuerySchema = z.object({ page: PageSchema, pageSize: PageSizeSchema });
export type ModerationQuery = z.infer<typeof ModerationQuerySchema>;

export const ModerationResponseSchema = z.object({
  items: z.array(ModerationItemSchema),
  ...PageInfoShape,
});
export type ModerationResponse = z.infer<typeof ModerationResponseSchema>;

/**
 * Decisão sobre uma tarefa: `approve` publica um preço pendente, `reject` rejeita (ou retira um já
 * publicado) e `keep` mantém o preço como está e encerra a tarefa.
 */
export const ModerationActionSchema = z.enum(["approve", "reject", "keep"]);
export type ModerationAction = z.infer<typeof ModerationActionSchema>;

export const ModerationDecisionRequestSchema = z.object({
  action: ModerationActionSchema,
  note: ReviewNoteSchema.optional(),
});
export type ModerationDecisionRequest = z.infer<typeof ModerationDecisionRequestSchema>;

// ── Lista de compras na conta (usuário logado) ─────────────────────────────────────────────────

/** Limites da lista: iguais no aparelho, na API e no banco. */
export const MAX_LIST_ITEMS = 100;
export const MAX_LIST_ITEM_QUANTITY = 99;

/** Um item da lista como o aparelho o envia: só o produto e a quantidade. */
export const ListLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(MAX_LIST_ITEM_QUANTITY),
});
export type ListLine = z.infer<typeof ListLineSchema>;

/**
 * Pedido de sincronização. O aparelho manda o que tem e o que sabe sobre a última sincronização;
 * quem decide quem vence (servidor, aparelho ou a união dos dois) é a API:
 *  - `localOwnerId`: a conta com a qual esta lista foi sincronizada pela última vez (`null` = lista
 *    nunca sincronizada, ex.: montada sem login);
 *  - `baseUpdatedAt`: a versão do servidor que o aparelho viu na última sincronização;
 *  - `dirty`: o aparelho tem alterações ainda não enviadas.
 */
export const SyncListRequestSchema = z.object({
  items: z.array(ListLineSchema).max(MAX_LIST_ITEMS),
  baseUpdatedAt: z.string().max(40).nullable(),
  dirty: z.boolean(),
  localOwnerId: z.uuid().nullable(),
});
export type SyncListRequest = z.infer<typeof SyncListRequestSchema>;

/** Item da lista da conta, com o nome do produto para o aparelho exibir sem outra consulta. */
export const SyncedListItemSchema = ListLineSchema.extend({ name: z.string() });
export type SyncedListItem = z.infer<typeof SyncedListItemSchema>;

/** A lista da conta depois da sincronização: o aparelho passa a espelhá-la. */
export const SyncListResponseSchema = z.object({
  items: z.array(SyncedListItemSchema).max(MAX_LIST_ITEMS),
  /** Versão da lista no servidor (opaca; devolva-a como `baseUpdatedAt`). `null` = sem lista. */
  updatedAt: z.string().nullable(),
  /** A conta dona desta lista (guarde como `localOwnerId`). */
  ownerId: z.uuid(),
});
export type SyncListResponse = z.infer<typeof SyncListResponseSchema>;
