"use server";

import { MAX_CONTRIBUTION_PHOTO_BYTES } from "@contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsePriceToCents } from "@/lib/price-input";
import { getAccessToken } from "@/server/session";
import { ApiRequestError, ApiUnavailableError } from "@/services/api/client";
import { searchProducts, submitContribution } from "@/services/api/endpoints";

// Camada fina: valida o formulário (UX) e repassa à API, que revalida tudo, sanitiza a foto e
// decide. O envio nasce SEMPRE pendente; quem publica é um admin, depois de ver a foto.

export interface ContributeState {
  ok: boolean;
  message: string;
}

export interface ProductOption {
  productId: string;
  name: string;
  brand: string | null;
  sizeValue: number;
  sizeUnit: string;
}

/** Erros da API cuja mensagem (pt-BR, escrita para o usuário) pode ser mostrada como está. */
const USER_FACING_API_CODES = new Set([
  "invalid_photo",
  "invalid_target",
  "duplicate_photo",
  "daily_limit",
  "rate_limited",
  "payload_too_large",
]);

const failure = (message: string): ContributeState => ({ ok: false, message });

export async function submitContributionAction(
  _previous: ContributeState,
  form: FormData,
): Promise<ContributeState> {
  const accessToken = await getAccessToken();
  if (!accessToken) return failure("Entre na sua conta para enviar preços.");

  const storeId = z.uuid().safeParse(form.get("storeId"));
  if (!storeId.success) return failure("Escolha o mercado.");
  const productId = z.uuid().safeParse(form.get("productId"));
  if (!productId.success) return failure("Escolha o produto.");
  const priceCents = parsePriceToCents(String(form.get("price") ?? ""));
  if (priceCents === null) return failure("Informe o preço da etiqueta, por exemplo 5,99.");
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return failure("Tire a foto da etiqueta.");
  if (photo.size > MAX_CONTRIBUTION_PHOTO_BYTES) {
    return failure("A foto ficou grande demais. Tire outra, mais perto da etiqueta.");
  }
  if (form.get("consent") !== "on") {
    return failure("Confirme que a foto mostra só a etiqueta, sem pessoas.");
  }

  // Só o que a API espera: nada do que veio no formulário passa adiante sem ser validado acima.
  const request = new FormData();
  request.set("storeId", storeId.data);
  request.set("productId", productId.data);
  request.set("priceCents", String(priceCents));
  request.set("promo", form.get("promo") === "on" ? "true" : "false");
  request.set("photo", photo, "etiqueta.jpg");

  try {
    await submitContribution(accessToken, request);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) return failure("Sua sessão expirou. Entre de novo para continuar.");
      if (USER_FACING_API_CODES.has(error.code)) return failure(error.message);
      console.error("envio de preço recusado pela API", error.status, error.code);
    } else if (!(error instanceof ApiUnavailableError)) {
      throw error;
    }
    return failure("Não foi possível enviar agora. Tente de novo em instantes.");
  }

  revalidatePath("/conta/envios");
  return {
    ok: true,
    message:
      "Enviado! Seu preço já aparece na Comunidade como não confirmado e vira confirmado quando outras pessoas o confirmarem ou a equipe o aprovar.",
  };
}

const MIN_TERM_LENGTH = 2;
const MAX_TERM_LENGTH = 80;
const MAX_OPTIONS = 8;

/** Busca de produto para o formulário (a busca tolerante a erros de digitação é da API). */
export async function searchProductOptionsAction(term: unknown): Promise<ProductOption[]> {
  if (typeof term !== "string") return [];
  const cleanTerm = term.trim().slice(0, MAX_TERM_LENGTH);
  if (cleanTerm.length < MIN_TERM_LENGTH) return [];
  try {
    const { hits } = await searchProducts(cleanTerm, { pageSize: MAX_OPTIONS });
    return hits.map((hit) => ({
      productId: hit.productId,
      name: hit.name,
      brand: hit.brand,
      sizeValue: hit.sizeValue,
      sizeUnit: hit.sizeUnit,
    }));
  } catch {
    return [];
  }
}
