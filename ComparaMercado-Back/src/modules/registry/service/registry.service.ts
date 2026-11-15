import { DomainError } from "../../../lib/domain-error";
import { isValidGtin } from "../../../lib/gtin";
import type { RegistryRepository, RegistryService } from "../registry.types";

/** Profundidade máxima da árvore de categorias percorrida ao checar ciclos (proteção contra loop). */
const MAX_CATEGORY_DEPTH = 10;

function assertValidGtin(gtin: string | null | undefined) {
  if (gtin && !isValidGtin(gtin)) {
    throw new DomainError("invalid_gtin", "O código de barras é inválido (dígito verificador).");
  }
}

/**
 * Regras do cadastro-base que o banco não expressa sozinho: dígito verificador do GTIN e árvore
 * de categorias sem ciclo. O resto (unicidade, referências, país da cidade) o banco garante e o
 * repositório traduz em erro de negócio.
 */
export function createRegistryService(repository: RegistryRepository): RegistryService {
  /** Uma categoria não pode ser filha dela mesma nem de uma descendente. */
  async function assertNoCategoryCycle(categoryId: string, parentId: string | null | undefined) {
    let cursor = parentId ?? null;
    for (let depth = 0; cursor && depth < MAX_CATEGORY_DEPTH; depth++) {
      if (cursor === categoryId) {
        throw new DomainError("invalid_parent", "A categoria não pode ficar dentro dela mesma.");
      }
      const parent = await repository.findCategory(cursor);
      cursor = parent?.parentId ?? null;
    }
  }

  return {
    listCities: (query) => repository.listCities(query),
    createCity: (input) => repository.createCity(input),
    updateCity: (cityId, patch) => repository.updateCity(cityId, patch),

    listStores: (query) => repository.listStores(query),
    createStore: (input) => repository.createStore(input),
    updateStore: (storeId, patch) => repository.updateStore(storeId, patch),

    listCategories: (query) => repository.listCategories(query),
    createCategory: (input) => repository.createCategory(input),
    async updateCategory(categoryId, patch) {
      await assertNoCategoryCycle(categoryId, patch.parentId);
      return repository.updateCategory(categoryId, patch);
    },

    listProducts: (query) => repository.listProducts(query),
    async createProduct(input) {
      assertValidGtin(input.gtin);
      return repository.createProduct(input);
    },
    async updateProduct(productId, patch) {
      assertValidGtin(patch.gtin);
      return repository.updateProduct(productId, patch);
    },
  };
}
