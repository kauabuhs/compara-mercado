"use server";

import {
  type ApiResult,
  CompareListRequestSchema,
  type ListComparison,
  SyncListRequestSchema,
  type SyncListResponse,
} from "@contracts";
import { getClientIp } from "@/server/request";
import { getAccessToken } from "@/server/session";
import { ApiRequestError } from "@/services/api/client";
import { compareList, syncMyList } from "@/services/api/endpoints";

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

export type SyncListActionResult =
  | { status: "anonymous" }
  | { status: "ok"; data: SyncListResponse }
  | { status: "error" };

/**
 * Sincroniza a lista do aparelho com a da conta. Sem sessão devolve `anonymous` (não é erro: quem
 * não tem conta só usa a lista no aparelho) sem chamar a API. A política de quem vence é da API.
 */
export async function syncListAction(input: unknown): Promise<SyncListActionResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) return { status: "anonymous" };
  const parsedRequest = SyncListRequestSchema.safeParse(input);
  if (!parsedRequest.success) return { status: "error" };
  try {
    return { status: "ok", data: await syncMyList(accessToken, parsedRequest.data) };
  } catch (error) {
    // Sessão vencida: tratada como "sem login" (a lista continua no aparelho).
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
      return { status: "anonymous" };
    }
    console.error(
      "sincronização da lista falhou",
      error instanceof ApiRequestError ? error.code : "",
    );
    return { status: "error" };
  }
}
