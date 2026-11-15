import { Hono } from "hono";
import {
  AdminListQuerySchema,
  apiRoutes,
  CreateCategoryRequestSchema,
  CreateCityRequestSchema,
  CreateProductRequestSchema,
  CreateStoreRequestSchema,
  UpdateCategoryRequestSchema,
  UpdateCityRequestSchema,
  UpdateProductRequestSchema,
  UpdateStoreRequestSchema,
} from "../../../contracts";
import { DomainError } from "../../../lib/domain-error";
import { requireAdmin, requireUser } from "../../../middlewares/auth";
import {
  type AppEnv,
  parseJsonBody,
  parseQuery,
  parseUuidParam,
} from "../../../middlewares/context";
import { ApiError, errors } from "../../../middlewares/errors";
import type { Authenticator } from "../../auth/auth.types";
import type { RegistryErrorCode, RegistryServiceFactory } from "../registry.types";

export interface RegistryRoutesDeps {
  authenticator: Authenticator;
  registryFor: RegistryServiceFactory;
}

const STATUS_BY_CODE: Record<RegistryErrorCode, number> = {
  duplicate: 409,
  invalid_reference: 400,
  constraint_violation: 400,
  invalid_gtin: 400,
  invalid_parent: 400,
};

function toApiError(error: unknown): unknown {
  if (error instanceof DomainError && error.code in STATUS_BY_CODE) {
    return new ApiError(STATUS_BY_CODE[error.code as RegistryErrorCode], error.code, error.message);
  }
  return error;
}

/** Roda a operação convertendo erro de negócio do cadastro em resposta HTTP padronizada. */
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * Cadastro-base (admin): cidades, mercados, categorias e produtos. Só admin; as operações rodam
 * sob a RLS do próprio usuário. Não há DELETE: desativar/arquivar é um PATCH de situação.
 */
export function registryRoutes({ authenticator, registryFor }: RegistryRoutesDeps) {
  const routes = new Hono<AppEnv>();
  routes.use("/v1/admin/*", requireUser(authenticator), requireAdmin);

  // Cidades
  routes.get(apiRoutes.adminCities, async (c) => {
    const query = parseQuery(c, AdminListQuerySchema);
    const { items, total } = await registryFor(c.get("accessToken")).listCities(query);
    return c.json({ items, total, page: query.page, pageSize: query.pageSize });
  });
  routes.post(apiRoutes.adminCities, async (c) => {
    const input = await parseJsonBody(c, CreateCityRequestSchema);
    return c.json(await guarded(() => registryFor(c.get("accessToken")).createCity(input)), 201);
  });
  routes.patch(apiRoutes.adminCity(":cityId"), async (c) => {
    const cityId = parseUuidParam(c, "cityId");
    const patch = await parseJsonBody(c, UpdateCityRequestSchema);
    const city = await guarded(() => registryFor(c.get("accessToken")).updateCity(cityId, patch));
    if (!city) throw errors.notFound("Cidade não encontrada.");
    return c.json(city);
  });

  // Mercados
  routes.get(apiRoutes.adminStores, async (c) => {
    const query = parseQuery(c, AdminListQuerySchema);
    const { items, total } = await registryFor(c.get("accessToken")).listStores(query);
    return c.json({ items, total, page: query.page, pageSize: query.pageSize });
  });
  routes.post(apiRoutes.adminStores, async (c) => {
    const input = await parseJsonBody(c, CreateStoreRequestSchema);
    return c.json(await guarded(() => registryFor(c.get("accessToken")).createStore(input)), 201);
  });
  routes.patch(apiRoutes.adminStore(":storeId"), async (c) => {
    const storeId = parseUuidParam(c, "storeId");
    const patch = await parseJsonBody(c, UpdateStoreRequestSchema);
    const store = await guarded(() =>
      registryFor(c.get("accessToken")).updateStore(storeId, patch),
    );
    if (!store) throw errors.notFound("Mercado não encontrado.");
    return c.json(store);
  });

  // Categorias
  routes.get(apiRoutes.adminCategories, async (c) => {
    const query = parseQuery(c, AdminListQuerySchema);
    const { items, total } = await registryFor(c.get("accessToken")).listCategories(query);
    return c.json({ items, total, page: query.page, pageSize: query.pageSize });
  });
  routes.post(apiRoutes.adminCategories, async (c) => {
    const input = await parseJsonBody(c, CreateCategoryRequestSchema);
    return c.json(
      await guarded(() => registryFor(c.get("accessToken")).createCategory(input)),
      201,
    );
  });
  routes.patch(apiRoutes.adminCategory(":categoryId"), async (c) => {
    const categoryId = parseUuidParam(c, "categoryId");
    const patch = await parseJsonBody(c, UpdateCategoryRequestSchema);
    const category = await guarded(() =>
      registryFor(c.get("accessToken")).updateCategory(categoryId, patch),
    );
    if (!category) throw errors.notFound("Categoria não encontrada.");
    return c.json(category);
  });

  // Produtos
  routes.get(apiRoutes.adminProducts, async (c) => {
    const query = parseQuery(c, AdminListQuerySchema);
    const { items, total } = await registryFor(c.get("accessToken")).listProducts(query);
    return c.json({ items, total, page: query.page, pageSize: query.pageSize });
  });
  routes.post(apiRoutes.adminProducts, async (c) => {
    const input = await parseJsonBody(c, CreateProductRequestSchema);
    return c.json(await guarded(() => registryFor(c.get("accessToken")).createProduct(input)), 201);
  });
  routes.patch(apiRoutes.adminProduct(":productId"), async (c) => {
    const productId = parseUuidParam(c, "productId");
    const patch = await parseJsonBody(c, UpdateProductRequestSchema);
    const product = await guarded(() =>
      registryFor(c.get("accessToken")).updateProduct(productId, patch),
    );
    if (!product) throw errors.notFound("Produto não encontrado.");
    return c.json(product);
  });

  return routes;
}
