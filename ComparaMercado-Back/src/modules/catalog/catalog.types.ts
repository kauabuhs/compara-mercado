import type {
  CompareListRequest,
  ListComparison,
  OffersQuery,
  PriceOffer,
  ProductDetails,
  ProductHit,
  SearchProductsQuery,
  Store,
  StoresQuery,
} from "../../contracts";

/**
 * Porta do módulo: as rotas HTTP só conhecem esta interface. A implementação com Supabase está
 * em `catalog.service.ts`, e os testes das rotas usam implementações em memória.
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
