import type {
  AdminOverview,
  CompareListRequest,
  ListComparison,
  ManualPriceRequest,
  OffersQuery,
  PendingObservation,
  PriceFormOptions,
  PriceOffer,
  ProductDetails,
  ProductHit,
  ReviewDecision,
  SearchProductsQuery,
  SessionUser,
  Store,
  StoresQuery,
} from "@compara/contracts";

/**
 * Portas da aplicação: as rotas HTTP só conhecem estas interfaces. A implementação com Supabase
 * fica em `supabase-services.ts`, e os testes das rotas usam implementações em memória.
 */

/** Leituras públicas (sem login). */
export interface CatalogService {
  searchProducts(query: SearchProductsQuery): Promise<ProductHit[]>;
  /** `null` quando o produto não existe ou está arquivado. */
  getProductDetails(productId: string): Promise<ProductDetails | null>;
  listOffers(query: OffersQuery): Promise<PriceOffer[]>;
  listStores(query: StoresQuery): Promise<Store[]>;
  compareList(request: CompareListRequest): Promise<ListComparison>;
}

/** Operações de administração, executadas com a identidade (e a RLS) do próprio usuário. */
export interface AdminService {
  getOverview(): Promise<AdminOverview>;
  getPriceFormOptions(): Promise<PriceFormOptions>;
  getReviewQueue(): Promise<PendingObservation[]>;
  createManualPrice(request: ManualPriceRequest, adminUserId: string): Promise<void>;
  /** Registra a decisão. `false` = nada foi decidido (não existe ou já saiu de "pending"). */
  reviewObservation(observationId: string, decision: ReviewDecision): Promise<boolean>;
}

export interface Authenticator {
  /** Valida o token no provedor de identidade. `null` se inválido, expirado ou revogado. */
  authenticate(accessToken: string): Promise<SessionUser | null>;
}

export interface Services {
  catalog: CatalogService;
  authenticator: Authenticator;
  /** Serviço de administração amarrado ao token (a RLS vê o usuário, não um papel de serviço). */
  adminFor(accessToken: string): AdminService;
}
