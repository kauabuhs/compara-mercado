"use server";

import { ApiRequestError } from "@/services/api/client";
import { searchProducts } from "@/services/api/endpoints";

export interface ProductSuggestion {
  productId: string;
  name: string;
  brand: string | null;
  sizeValue: number;
  sizeUnit: string;
  minUnitPriceCents: number | null;
}

const MIN_TERM_LENGTH = 2;
const MAX_TERM_LENGTH = 80;
const MAX_SUGGESTIONS = 6;

// Adaptador fino para as sugestões ao digitar: a busca tolerante a erros é da API. Falhas viram lista
// vazia (sugestão é só um atalho; o envio do formulário continua levando à página de resultados).
export async function suggestProductsAction(term: unknown): Promise<ProductSuggestion[]> {
  if (typeof term !== "string") return [];
  const cleanTerm = term.trim().slice(0, MAX_TERM_LENGTH);
  if (cleanTerm.length < MIN_TERM_LENGTH) return [];
  try {
    const hits = await searchProducts(cleanTerm, MAX_SUGGESTIONS);
    return hits.map((hit) => ({
      productId: hit.productId,
      name: hit.name,
      brand: hit.brand,
      sizeValue: hit.sizeValue,
      sizeUnit: hit.sizeUnit,
      minUnitPriceCents: hit.minUnitPriceCents,
    }));
  } catch (error) {
    if (!(error instanceof ApiRequestError && error.status === 429)) {
      console.error(
        "sugestões de busca falharam",
        error instanceof ApiRequestError ? error.code : "",
      );
    }
    return [];
  }
}
