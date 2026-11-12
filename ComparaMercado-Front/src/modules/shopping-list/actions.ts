"use server";

import { type ApiResult, CompareListRequestSchema, type ListComparison } from "@contracts";
import { getClientIp } from "@/server/request";
import { ApiRequestError } from "@/services/api/client";
import { compareList } from "@/services/api/endpoints";

export type CompareActionResult = ApiResult<ListComparison>;

// Adaptador fino: valida a entrada para dar feedback imediato, repassa o IP do cliente para o
// limite de taxa da API e traduz erros em mensagens para o usuário. A comparação em si é da API.
export async function compareListAction(input: unknown): Promise<CompareActionResult> {
  const parsedRequest = CompareListRequestSchema.safeParse(input);
  if (!parsedRequest.success) {
    return { ok: false, error: "Lista inválida. Revise os itens e tente de novo." };
  }

  try {
    const comparison = await compareList(parsedRequest.data, await getClientIp());
    return { ok: true, data: comparison };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 429) {
      return { ok: false, error: "Muitas comparações em pouco tempo. Aguarde um minuto." };
    }
    console.error("comparação de lista falhou", error instanceof ApiRequestError ? error.code : "");
    return { ok: false, error: "Não foi possível comparar agora. Tente de novo em instantes." };
  }
}
