"use server";

import {
  CreateCategoryRequestSchema,
  CreateCityRequestSchema,
  CreateProductRequestSchema,
  CreateStoreRequestSchema,
  ProductStatusSchema,
  StoreStatusSchema,
  UpdateCategoryRequestSchema,
  UpdateCityRequestSchema,
  UpdateProductRequestSchema,
  UpdateStoreRequestSchema,
} from "@contracts";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/modules/admin/actions";
import { getAccessToken } from "@/server/session";
import { ApiRequestError, CATALOG_CACHE_TAG } from "@/services/api/client";
import {
  createAdminCategory,
  createAdminCity,
  createAdminProduct,
  createAdminStore,
  updateAdminCategory,
  updateAdminCity,
  updateAdminProduct,
  updateAdminStore,
} from "@/services/api/endpoints";

// Cadastro-base do painel: esta camada só lê o formulário (UX) e repassa à API, que autoriza
// (papel `admin` + RLS) e aplica as regras. "Excluir" nunca apaga: desativa ou arquiva.

const INVALID_FORM: ActionState = { ok: false, message: "Confira os campos do formulário." };

async function requireAccessToken(): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("não autorizado");
  return accessToken;
}

/** Texto aparado; vazio vira `null` (campo opcional não preenchido). */
function text(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Número digitado em pt-BR ("-29,17" ou "-29.17"); `undefined` se vazio ou inválido. */
function decimal(form: FormData, name: string): number | undefined {
  const raw = text(form, name);
  if (raw === null) return undefined;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

/** Só dígitos (CNPJ e código de barras podem vir com pontuação ou espaços). */
function digits(form: FormData, name: string): string | null {
  const raw = text(form, name);
  if (raw === null) return null;
  const onlyDigits = raw.replace(/\D/g, "");
  return onlyDigits === "" ? null : onlyDigits;
}

/** Traduz a falha da API em mensagem para quem usa o painel; perda de acesso derruba a ação. */
function failure(error: unknown, fallback: string): ActionState {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) throw new Error("não autorizado");
    if (error.status === 409) {
      return {
        ok: false,
        message: "Já existe um cadastro com esses dados (código, CNPJ, código de barras ou nome).",
      };
    }
    if (error.status === 404) {
      return { ok: false, message: "Este cadastro não existe mais. Atualize a página." };
    }
    if (error.status === 400 && error.code !== "invalid_request") {
      return { ok: false, message: error.message };
    }
  }
  return { ok: false, message: fallback };
}

/** Zera o cache de leituras públicas do Next para a mudança aparecer já nas telas do app. */
function afterWrite() {
  updateTag(CATALOG_CACHE_TAG);
  revalidatePath("/", "layout");
}

// ── Cidades ──────────────────────────────────────────────────────────────────────────────────

export async function saveCity(_prev: ActionState, form: FormData): Promise<ActionState> {
  const accessToken = await requireAccessToken();
  const id = text(form, "id");
  try {
    if (id) {
      const patch = UpdateCityRequestSchema.safeParse({
        name: text(form, "name") ?? undefined,
        active: form.get("active") === "on",
      });
      if (!patch.success || !z.uuid().safeParse(id).success) return INVALID_FORM;
      await updateAdminCity(accessToken, id, patch.data);
    } else {
      const input = CreateCityRequestSchema.safeParse({
        name: text(form, "name"),
        uf: text(form, "uf"),
        ibgeCode: digits(form, "ibgeCode"),
        active: form.get("active") === "on",
      });
      if (!input.success) return INVALID_FORM;
      await createAdminCity(accessToken, input.data);
    }
  } catch (error) {
    return failure(error, "Não foi possível salvar a cidade.");
  }
  afterWrite();
  return { ok: true, message: id ? "Cidade atualizada." : "Cidade cadastrada." };
}

export async function setCityActive(cityId: string, active: boolean): Promise<void> {
  const accessToken = await requireAccessToken();
  const safeId = z.uuid().parse(cityId);
  try {
    await updateAdminCity(accessToken, safeId, { active });
  } catch (error) {
    failure(error, "");
    throw new Error("falha ao alterar a cidade");
  }
  afterWrite();
}

// ── Mercados ─────────────────────────────────────────────────────────────────────────────────

export async function saveStore(_prev: ActionState, form: FormData): Promise<ActionState> {
  const accessToken = await requireAccessToken();
  const id = text(form, "id");
  const fields = {
    name: text(form, "name"),
    cityId: text(form, "cityId"),
    cnpj: digits(form, "cnpj"),
    address: text(form, "address"),
    neighborhood: text(form, "neighborhood"),
    lat: decimal(form, "lat"),
    lng: decimal(form, "lng"),
    status: text(form, "status") ?? undefined,
  };
  try {
    if (id) {
      const patch = UpdateStoreRequestSchema.safeParse({
        ...fields,
        name: fields.name ?? undefined,
        cityId: fields.cityId ?? undefined,
      });
      if (!patch.success || !z.uuid().safeParse(id).success) return INVALID_FORM;
      await updateAdminStore(accessToken, id, patch.data);
    } else {
      const input = CreateStoreRequestSchema.safeParse(fields);
      if (!input.success) return INVALID_FORM;
      await createAdminStore(accessToken, input.data);
    }
  } catch (error) {
    return failure(error, "Não foi possível salvar o mercado.");
  }
  afterWrite();
  return { ok: true, message: id ? "Mercado atualizado." : "Mercado cadastrado." };
}

export async function setStoreStatus(storeId: string, status: string): Promise<void> {
  const accessToken = await requireAccessToken();
  const safeId = z.uuid().parse(storeId);
  const safeStatus = StoreStatusSchema.parse(status);
  try {
    await updateAdminStore(accessToken, safeId, { status: safeStatus });
  } catch (error) {
    failure(error, "");
    throw new Error("falha ao alterar o mercado");
  }
  afterWrite();
}

// ── Categorias ───────────────────────────────────────────────────────────────────────────────

export async function saveCategory(_prev: ActionState, form: FormData): Promise<ActionState> {
  const accessToken = await requireAccessToken();
  const id = text(form, "id");
  try {
    if (id) {
      const patch = UpdateCategoryRequestSchema.safeParse({
        name: text(form, "name") ?? undefined,
        parentId: text(form, "parentId"),
      });
      if (!patch.success || !z.uuid().safeParse(id).success) return INVALID_FORM;
      await updateAdminCategory(accessToken, id, patch.data);
    } else {
      const input = CreateCategoryRequestSchema.safeParse({
        name: text(form, "name"),
        slug: text(form, "slug"),
        parentId: text(form, "parentId"),
      });
      if (!input.success) return INVALID_FORM;
      await createAdminCategory(accessToken, input.data);
    }
  } catch (error) {
    return failure(error, "Não foi possível salvar a categoria.");
  }
  afterWrite();
  return { ok: true, message: id ? "Categoria atualizada." : "Categoria cadastrada." };
}

// ── Produtos ─────────────────────────────────────────────────────────────────────────────────

export async function saveProduct(_prev: ActionState, form: FormData): Promise<ActionState> {
  const accessToken = await requireAccessToken();
  const id = text(form, "id");
  const fields = {
    name: text(form, "name"),
    categoryId: text(form, "categoryId"),
    gtin: digits(form, "gtin"),
    sizeValue: decimal(form, "sizeValue"),
    sizeUnit: text(form, "sizeUnit") ?? undefined,
  };
  try {
    if (id) {
      const patch = UpdateProductRequestSchema.safeParse({
        ...fields,
        name: fields.name ?? undefined,
      });
      if (!patch.success || !z.uuid().safeParse(id).success) return INVALID_FORM;
      await updateAdminProduct(accessToken, id, patch.data);
    } else {
      const input = CreateProductRequestSchema.safeParse({ ...fields, brand: text(form, "brand") });
      if (!input.success) return INVALID_FORM;
      await createAdminProduct(accessToken, input.data);
    }
  } catch (error) {
    return failure(error, "Não foi possível salvar o produto.");
  }
  afterWrite();
  return { ok: true, message: id ? "Produto atualizado." : "Produto cadastrado." };
}

export async function setProductStatus(productId: string, status: string): Promise<void> {
  const accessToken = await requireAccessToken();
  const safeId = z.uuid().parse(productId);
  const safeStatus = ProductStatusSchema.parse(status);
  try {
    await updateAdminProduct(accessToken, safeId, { status: safeStatus });
  } catch (error) {
    failure(error, "");
    throw new Error("falha ao alterar o produto");
  }
  afterWrite();
}
