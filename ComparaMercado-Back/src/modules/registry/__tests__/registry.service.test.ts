import { describe, expect, it, vi } from "vitest";
import type { AdminCategory } from "../../../contracts";
import { DomainError } from "../../../lib/domain-error";
import type { RegistryRepository } from "../registry.types";
import { createRegistryService } from "../service/registry.service";

const ID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_B = "aaaaaaaa-0000-4000-8000-000000000002";
const ID_C = "aaaaaaaa-0000-4000-8000-000000000003";
const PRODUCT_ID = "bbbbbbbb-0000-4000-8000-000000000001";

// Arroz GTIN-13 real (dígito verificador correto) e o mesmo código com o último dígito trocado.
const VALID_GTIN = "7891000100103";
const INVALID_GTIN = "7891000100104";

function category(id: string, parentId: string | null): AdminCategory {
  return { id, name: `Categoria ${id.slice(-1)}`, slug: `cat-${id.slice(-1)}`, parentId };
}

function createRepositoryStub(categories: AdminCategory[] = []): RegistryRepository {
  return {
    listCities: vi.fn(),
    createCity: vi.fn(),
    updateCity: vi.fn(),
    listStores: vi.fn(),
    createStore: vi.fn(),
    updateStore: vi.fn(),
    listCategories: vi.fn(),
    findCategory: vi.fn(async (id: string) => categories.find((item) => item.id === id) ?? null),
    createCategory: vi.fn(),
    updateCategory: vi.fn().mockResolvedValue(null),
    listProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn().mockResolvedValue(null),
  };
}

describe("registry.service · produto", () => {
  it("recusa GTIN com dígito verificador errado, sem chegar ao banco", async () => {
    const repository = createRepositoryStub();
    const service = createRegistryService(repository);
    await expect(
      service.createProduct({
        name: "Arroz",
        brand: null,
        categoryId: null,
        gtin: INVALID_GTIN,
        sizeValue: 5,
        sizeUnit: "kg",
      }),
    ).rejects.toMatchObject({ code: "invalid_gtin" });
    await expect(service.updateProduct(PRODUCT_ID, { gtin: INVALID_GTIN })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(repository.createProduct).not.toHaveBeenCalled();
    expect(repository.updateProduct).not.toHaveBeenCalled();
  });

  it("aceita GTIN válido, ausente (null) e a edição que não mexe no GTIN", async () => {
    const repository = createRepositoryStub();
    const service = createRegistryService(repository);
    await service.updateProduct(PRODUCT_ID, { gtin: VALID_GTIN });
    await service.updateProduct(PRODUCT_ID, { gtin: null });
    await service.updateProduct(PRODUCT_ID, { status: "archived" });
    expect(repository.updateProduct).toHaveBeenCalledTimes(3);
  });
});

describe("registry.service · categoria", () => {
  it("recusa ser filha de si mesma", async () => {
    const service = createRegistryService(createRepositoryStub([category(ID_A, null)]));
    await expect(service.updateCategory(ID_A, { parentId: ID_A })).rejects.toMatchObject({
      code: "invalid_parent",
    });
  });

  it("recusa ciclo com descendente (A → B → C; mover A para dentro de C)", async () => {
    const repository = createRepositoryStub([
      category(ID_A, null),
      category(ID_B, ID_A),
      category(ID_C, ID_B),
    ]);
    const service = createRegistryService(repository);
    await expect(service.updateCategory(ID_A, { parentId: ID_C })).rejects.toMatchObject({
      code: "invalid_parent",
    });
    expect(repository.updateCategory).not.toHaveBeenCalled();
  });

  it("permite mover para outra ramificação, virar raiz e só renomear", async () => {
    const repository = createRepositoryStub([
      category(ID_A, null),
      category(ID_B, ID_A),
      category(ID_C, null),
    ]);
    const service = createRegistryService(repository);
    await service.updateCategory(ID_B, { parentId: ID_C });
    await service.updateCategory(ID_B, { parentId: null });
    await service.updateCategory(ID_B, { name: "Novo nome" });
    expect(repository.updateCategory).toHaveBeenCalledTimes(3);
  });
});
