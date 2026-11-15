import type {
  AdminCategory,
  AdminCity,
  AdminListQuery,
  AdminProduct,
  AdminStore,
  SizeUnit,
} from "../../../contracts";
import type { Database } from "../../../database/database.types";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import { DomainError } from "../../../lib/domain-error";
import { pageOffset } from "../../../lib/pagination";
import type { RegistryErrorCode, RegistryRepository } from "../registry.types";

const CITY_COLUMNS = "id,name,uf,ibge_code,active";
const STORE_COLUMNS = "id,name,city_id,cnpj,address,neighborhood,lat,lng,status,cities(name)";
const CATEGORY_COLUMNS = "id,name,slug,parent_id";
const PRODUCT_COLUMNS = "id,canonical_name,brand,category_id,gtin,size_value,size_unit,status";

interface PgError {
  message: string;
  code?: string;
}

type Tables = Database["public"]["Tables"];
/**
 * `market_id` (loja) e `family_id` (produto) são NOT NULL no banco, mas quem os preenche é um
 * gatilho BEFORE INSERT (`stores_bi_market`, `a_products_resolve_family`). O tipo gerado não sabe
 * disso e os marca como obrigatórios; por isso o insert é tipado sem eles e convertido.
 */
type StoreInsert = Omit<Tables["stores"]["Insert"], "market_id">;
type ProductInsert = Omit<Tables["products"]["Insert"], "family_id">;

/** Erros de integridade do Postgres viram erro de negócio; o resto é falha de dados (502). */
function fail(operation: string, error: PgError): never {
  const business: Record<string, [RegistryErrorCode, string]> = {
    "23505": ["duplicate", "Já existe um registro com esses dados."],
    "23503": ["invalid_reference", "Uma das referências informadas não existe."],
    "23514": ["constraint_violation", "Os dados não respeitam as regras do cadastro."],
    "23502": ["constraint_violation", "Faltam dados obrigatórios para este cadastro."],
  };
  const known = error.code ? business[error.code] : undefined;
  if (known) throw new DomainError(known[0], known[1], { cause: error });
  throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

function throwIfError(operation: string, error: PgError | null) {
  if (error) fail(operation, error);
}

/** Escapa `%`, `_` e `\` para o texto digitado valer literalmente num ILIKE. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** O PostgREST grava `geography` a partir de EWKT (longitude primeiro). */
function pointEwkt(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

interface CityRow {
  id: string;
  name: string;
  uf: string | null;
  ibge_code: string | null;
  active: boolean;
}
const toCity = (row: CityRow): AdminCity => ({
  id: row.id,
  name: row.name,
  uf: row.uf,
  ibgeCode: row.ibge_code,
  active: row.active,
});

interface StoreRow {
  id: string;
  name: string;
  city_id: string;
  cnpj: string | null;
  address: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  status: AdminStore["status"];
  cities: { name: string } | null;
}
const toStore = (row: StoreRow): AdminStore => ({
  id: row.id,
  name: row.name,
  cityId: row.city_id,
  cityName: row.cities?.name ?? null,
  cnpj: row.cnpj,
  address: row.address,
  neighborhood: row.neighborhood,
  lat: row.lat ?? 0,
  lng: row.lng ?? 0,
  status: row.status,
});

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}
const toCategory = (row: CategoryRow): AdminCategory => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  parentId: row.parent_id,
});

interface ProductRow {
  id: string;
  canonical_name: string;
  brand: string | null;
  category_id: string | null;
  gtin: string | null;
  size_value: number | string;
  size_unit: string;
  status: AdminProduct["status"];
}
const toProduct = (row: ProductRow): AdminProduct => ({
  id: row.id,
  name: row.canonical_name,
  brand: row.brand,
  categoryId: row.category_id,
  gtin: row.gtin,
  sizeValue: Number(row.size_value),
  sizeUnit: row.size_unit as SizeUnit,
  status: row.status,
});

/**
 * Persistência do cadastro-base, sempre com o cliente do próprio admin: as políticas
 * `*_admin_write`/`*_admin_update` (e `is_admin()`) são a barreira, e não há DELETE.
 */
export function createRegistryRepository(userDb: Db): RegistryRepository {
  return {
    // ── Cidades ──────────────────────────────────────────────────────────────────────────────
    async listCities({ q, situation, page, pageSize }: AdminListQuery) {
      let query = userDb.from("cities").select(CITY_COLUMNS, { count: "exact" });
      if (q) query = query.ilike("name", likePattern(q));
      if (situation) query = query.eq("active", situation === "active");
      const from = pageOffset(page, pageSize);
      const { data, error, count } = await query
        .order("name")
        .order("id")
        .range(from, from + pageSize - 1);
      throwIfError("registry.listCities", error);
      return { total: count ?? 0, items: (data ?? []).map(toCity) };
    },

    async createCity(input) {
      const { data, error } = await userDb
        .from("cities")
        .insert({
          name: input.name,
          uf: input.uf,
          ibge_code: input.ibgeCode,
          active: input.active,
        })
        .select(CITY_COLUMNS)
        .single();
      throwIfError("registry.createCity", error);
      if (!data) throw new DbError("registry.createCity: sem retorno");
      return toCity(data);
    },

    async updateCity(cityId, patch) {
      const changes: { name?: string; active?: boolean } = {};
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.active !== undefined) changes.active = patch.active;
      const { data, error } = await userDb
        .from("cities")
        .update(changes)
        .eq("id", cityId)
        .select(CITY_COLUMNS)
        .maybeSingle();
      throwIfError("registry.updateCity", error);
      return data ? toCity(data) : null;
    },

    // ── Mercados ─────────────────────────────────────────────────────────────────────────────
    async listStores({ q, situation, page, pageSize }: AdminListQuery) {
      let query = userDb.from("stores").select(STORE_COLUMNS, { count: "exact" });
      if (q) query = query.ilike("name", likePattern(q));
      if (situation === "active") query = query.eq("status", "active");
      if (situation === "inactive") query = query.neq("status", "active");
      const from = pageOffset(page, pageSize);
      const { data, error, count } = await query
        .order("name")
        .order("id")
        .range(from, from + pageSize - 1);
      throwIfError("registry.listStores", error);
      return { total: count ?? 0, items: (data ?? []).map(toStore) };
    },

    async createStore(input) {
      const row: StoreInsert = {
        name: input.name,
        city_id: input.cityId,
        cnpj: input.cnpj,
        address: input.address,
        neighborhood: input.neighborhood,
        location: pointEwkt(input.lng, input.lat),
        status: input.status,
      };
      const { data, error } = await userDb
        .from("stores")
        .insert(row as Tables["stores"]["Insert"])
        .select(STORE_COLUMNS)
        .single();
      throwIfError("registry.createStore", error);
      if (!data) throw new DbError("registry.createStore: sem retorno");
      return toStore(data);
    },

    async updateStore(storeId, patch) {
      const changes: {
        name?: string;
        city_id?: string;
        cnpj?: string | null;
        address?: string | null;
        neighborhood?: string | null;
        location?: string;
        status?: AdminStore["status"];
      } = {};
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.cityId !== undefined) changes.city_id = patch.cityId;
      if (patch.cnpj !== undefined) changes.cnpj = patch.cnpj;
      if (patch.address !== undefined) changes.address = patch.address;
      if (patch.neighborhood !== undefined) changes.neighborhood = patch.neighborhood;
      if (patch.lat !== undefined && patch.lng !== undefined) {
        changes.location = pointEwkt(patch.lng, patch.lat);
      }
      if (patch.status !== undefined) changes.status = patch.status;
      const { data, error } = await userDb
        .from("stores")
        .update(changes)
        .eq("id", storeId)
        .select(STORE_COLUMNS)
        .maybeSingle();
      throwIfError("registry.updateStore", error);
      return data ? toStore(data) : null;
    },

    // ── Categorias ───────────────────────────────────────────────────────────────────────────
    async listCategories({ q, page, pageSize }: AdminListQuery) {
      let query = userDb.from("categories").select(CATEGORY_COLUMNS, { count: "exact" });
      if (q) query = query.ilike("name", likePattern(q));
      const from = pageOffset(page, pageSize);
      const { data, error, count } = await query
        .order("name")
        .order("id")
        .range(from, from + pageSize - 1);
      throwIfError("registry.listCategories", error);
      return { total: count ?? 0, items: (data ?? []).map(toCategory) };
    },

    async findCategory(categoryId) {
      const { data, error } = await userDb
        .from("categories")
        .select(CATEGORY_COLUMNS)
        .eq("id", categoryId)
        .maybeSingle();
      throwIfError("registry.findCategory", error);
      return data ? toCategory(data) : null;
    },

    async createCategory(input) {
      const { data, error } = await userDb
        .from("categories")
        .insert({ name: input.name, slug: input.slug, parent_id: input.parentId })
        .select(CATEGORY_COLUMNS)
        .single();
      throwIfError("registry.createCategory", error);
      if (!data) throw new DbError("registry.createCategory: sem retorno");
      return toCategory(data);
    },

    async updateCategory(categoryId, patch) {
      const changes: { name?: string; parent_id?: string | null } = {};
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.parentId !== undefined) changes.parent_id = patch.parentId;
      const { data, error } = await userDb
        .from("categories")
        .update(changes)
        .eq("id", categoryId)
        .select(CATEGORY_COLUMNS)
        .maybeSingle();
      throwIfError("registry.updateCategory", error);
      return data ? toCategory(data) : null;
    },

    // ── Produtos ─────────────────────────────────────────────────────────────────────────────
    async listProducts({ q, situation, page, pageSize }: AdminListQuery) {
      let query = userDb.from("products").select(PRODUCT_COLUMNS, { count: "exact" });
      // só dígitos de tamanho de código de barras: busca pelo GTIN exato; senão, pelo nome
      if (q && /^(\d{8}|\d{12,14})$/.test(q)) query = query.eq("gtin", q);
      else if (q) query = query.ilike("canonical_name", likePattern(q));
      if (situation === "active") query = query.eq("status", "active");
      if (situation === "inactive") query = query.neq("status", "active");
      const from = pageOffset(page, pageSize);
      const { data, error, count } = await query
        .order("canonical_name")
        .order("id")
        .range(from, from + pageSize - 1);
      throwIfError("registry.listProducts", error);
      return { total: count ?? 0, items: (data ?? []).map(toProduct) };
    },

    async createProduct(input) {
      // Sem `family_id`: o gatilho `a_products_resolve_family` cria (ou reaproveita) a família e
      // a marca a partir do nome, da marca e da categoria.
      const row: ProductInsert = {
        canonical_name: input.name,
        brand: input.brand,
        category_id: input.categoryId,
        gtin: input.gtin,
        size_value: input.sizeValue,
        size_unit: input.sizeUnit,
      };
      const { data, error } = await userDb
        .from("products")
        .insert(row as Tables["products"]["Insert"])
        .select(PRODUCT_COLUMNS)
        .single();
      throwIfError("registry.createProduct", error);
      if (!data) throw new DbError("registry.createProduct: sem retorno");
      return toProduct(data);
    },

    async updateProduct(productId, patch) {
      const changes: {
        canonical_name?: string;
        gtin?: string | null;
        size_value?: number;
        size_unit?: SizeUnit;
        status?: AdminProduct["status"];
      } = {};
      if (patch.name !== undefined) changes.canonical_name = patch.name;
      if (patch.gtin !== undefined) changes.gtin = patch.gtin;
      if (patch.sizeValue !== undefined) changes.size_value = patch.sizeValue;
      if (patch.sizeUnit !== undefined) changes.size_unit = patch.sizeUnit;
      if (patch.status !== undefined) changes.status = patch.status;

      // Primeiro os campos do próprio produto (os que mais falham: GTIN duplicado), depois a
      // categoria, que mora na família.
      let familyId: string | null = null;
      if (Object.keys(changes).length > 0) {
        const { data, error } = await userDb
          .from("products")
          .update(changes)
          .eq("id", productId)
          .select("family_id")
          .maybeSingle();
        throwIfError("registry.updateProduct", error);
        if (!data) return null;
        familyId = data.family_id;
      } else {
        const { data, error } = await userDb
          .from("products")
          .select("family_id")
          .eq("id", productId)
          .maybeSingle();
        throwIfError("registry.updateProduct.find", error);
        if (!data) return null;
        familyId = data.family_id;
      }

      if (patch.categoryId !== undefined && familyId) {
        // Marca e categoria pertencem à família: mudar aqui vale para todas as variantes dela.
        const { error } = await userDb
          .from("product_families")
          .update({ category_id: patch.categoryId })
          .eq("id", familyId);
        throwIfError("registry.updateProduct.family", error);
      }

      const { data, error } = await userDb
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("id", productId)
        .maybeSingle();
      throwIfError("registry.updateProduct.reload", error);
      return data ? toProduct(data) : null;
    },
  };
}
