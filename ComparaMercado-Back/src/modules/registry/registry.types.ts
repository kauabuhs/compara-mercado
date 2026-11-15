import type {
  AdminCategory,
  AdminCity,
  AdminListQuery,
  AdminProduct,
  AdminStore,
  CreateCategoryRequest,
  CreateCityRequest,
  CreateProductRequest,
  CreateStoreRequest,
  UpdateCategoryRequest,
  UpdateCityRequest,
  UpdateProductRequest,
  UpdateStoreRequest,
} from "../../contracts";
import type { Paged } from "../../lib/pagination";

/** Códigos estáveis dos erros de negócio do cadastro-base (o controller os traduz para HTTP). */
export type RegistryErrorCode =
  /** Já existe um registro com o mesmo identificador (IBGE, slug, CNPJ, GTIN, nome na cidade). */
  | "duplicate"
  /** Uma referência (cidade, categoria) não existe. */
  | "invalid_reference"
  /** O banco recusou o valor por uma regra de integridade (ex.: país da cidade ≠ mercado). */
  | "constraint_violation"
  /** O código de barras não passa na conferência do dígito verificador. */
  | "invalid_gtin"
  /** A categoria não pode ser filha dela mesma nem de uma descendente. */
  | "invalid_parent";

/**
 * Cadastro-base: o que o app lê (cidades, mercados, categorias e produtos), mas que não tem como
 * entrar pelo uso normal. Operações do admin sob a RLS dele. Os `update*` devolvem `null` quando
 * a linha não existe (ou a RLS não a deixa ver). Nada é apagado: "excluir" é mudar a situação.
 */
export interface RegistryService {
  listCities(query: AdminListQuery): Promise<Paged<AdminCity>>;
  createCity(input: CreateCityRequest): Promise<AdminCity>;
  updateCity(cityId: string, patch: UpdateCityRequest): Promise<AdminCity | null>;

  listStores(query: AdminListQuery): Promise<Paged<AdminStore>>;
  createStore(input: CreateStoreRequest): Promise<AdminStore>;
  updateStore(storeId: string, patch: UpdateStoreRequest): Promise<AdminStore | null>;

  listCategories(query: AdminListQuery): Promise<Paged<AdminCategory>>;
  createCategory(input: CreateCategoryRequest): Promise<AdminCategory>;
  updateCategory(categoryId: string, patch: UpdateCategoryRequest): Promise<AdminCategory | null>;

  listProducts(query: AdminListQuery): Promise<Paged<AdminProduct>>;
  createProduct(input: CreateProductRequest): Promise<AdminProduct>;
  updateProduct(productId: string, patch: UpdateProductRequest): Promise<AdminProduct | null>;
}

export type RegistryServiceFactory = (accessToken: string) => RegistryService;

/** Patch de produto já normalizado (GTIN conferido); o repositório traduz para colunas. */
export type ProductPatch = UpdateProductRequest;

/** Acesso a dados do módulo: a única camada que conhece as tabelas do cadastro-base. */
export interface RegistryRepository {
  listCities(query: AdminListQuery): Promise<Paged<AdminCity>>;
  createCity(input: CreateCityRequest): Promise<AdminCity>;
  updateCity(cityId: string, patch: UpdateCityRequest): Promise<AdminCity | null>;

  listStores(query: AdminListQuery): Promise<Paged<AdminStore>>;
  createStore(input: CreateStoreRequest): Promise<AdminStore>;
  updateStore(storeId: string, patch: UpdateStoreRequest): Promise<AdminStore | null>;

  listCategories(query: AdminListQuery): Promise<Paged<AdminCategory>>;
  findCategory(categoryId: string): Promise<AdminCategory | null>;
  createCategory(input: CreateCategoryRequest): Promise<AdminCategory>;
  updateCategory(categoryId: string, patch: UpdateCategoryRequest): Promise<AdminCategory | null>;

  listProducts(query: AdminListQuery): Promise<Paged<AdminProduct>>;
  createProduct(input: CreateProductRequest): Promise<AdminProduct>;
  updateProduct(productId: string, patch: ProductPatch): Promise<AdminProduct | null>;
}
