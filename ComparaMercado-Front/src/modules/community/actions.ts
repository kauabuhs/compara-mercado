"use server";

import {
  type CommunityFeedResponse,
  ConfirmationVerdictSchema,
  type ConfirmObservationResponse,
  FEED_PAGE_SIZE_DEFAULT,
  ReportReasonSchema,
} from "@contracts";
import { z } from "zod";
import { getAccessToken } from "@/server/session";
import { ApiRequestError, ApiUnavailableError } from "@/services/api/client";
import { confirmObservation, getCommunityFeed, reportObservation } from "@/services/api/endpoints";

// Camada fina: valida a entrada (UX) e repassa à API, que revalida e aplica as regras. A decisão de
// quando um preço vira "confirmado" e os tetos de abuso estão no banco, não aqui.

/** Erros da API cuja mensagem (pt-BR, escrita para o usuário) pode ser mostrada como está. */
const USER_FACING_API_CODES = new Set([
  "own_observation",
  "observation_unavailable",
  "already_done",
  "daily_limit",
  "rate_limited",
]);

const SESSION_EXPIRED = "Sua sessão expirou. Entre de novo para continuar.";
const TRY_AGAIN = "Não foi possível agora. Tente de novo em instantes.";

export type VoteResult =
  | ({ ok: true } & ConfirmObservationResponse)
  | { ok: false; message: string };
export type ReportResult = { ok: true } | { ok: false; message: string };
export type FeedResult = ({ ok: true } & CommunityFeedResponse) | { ok: false; message: string };

/** Traduz falhas da API em mensagem para a tela; o que não é do usuário vira texto genérico. */
function messageFor(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return SESSION_EXPIRED;
    if (USER_FACING_API_CODES.has(error.code)) return error.message;
    console.error("comunidade: recusada pela API", error.status, error.code);
    return TRY_AGAIN;
  }
  if (error instanceof ApiUnavailableError) return TRY_AGAIN;
  throw error;
}

export async function voteAction(observationId: string, verdict: string): Promise<VoteResult> {
  const id = z.uuid().safeParse(observationId);
  const parsedVerdict = ConfirmationVerdictSchema.safeParse(verdict);
  if (!id.success || !parsedVerdict.success) return { ok: false, message: TRY_AGAIN };

  const accessToken = await getAccessToken();
  if (!accessToken) return { ok: false, message: SESSION_EXPIRED };
  try {
    return { ok: true, ...(await confirmObservation(accessToken, id.data, parsedVerdict.data)) };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

export async function reportAction(observationId: string, reason: string): Promise<ReportResult> {
  const id = z.uuid().safeParse(observationId);
  const parsedReason = ReportReasonSchema.safeParse(reason);
  if (!id.success || !parsedReason.success) return { ok: false, message: TRY_AGAIN };

  const accessToken = await getAccessToken();
  if (!accessToken) return { ok: false, message: SESSION_EXPIRED };
  try {
    await reportObservation(accessToken, id.data, parsedReason.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

const FeedInputSchema = z.object({
  cityId: z.uuid(),
  cursor: z.string().max(200).optional(),
  promoOnly: z.boolean().default(false),
  where: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusM: z.number().int().min(100).max(50_000).optional(),
    })
    .optional(),
});

/**
 * Carrega uma página do feed para a tela (primeira página de uma aba, "carregar mais" ou
 * atualização). A posição, quando enviada, só vira consulta: não é gravada nem vai para a URL.
 */
export async function loadFeedAction(input: unknown): Promise<FeedResult> {
  const parsed = FeedInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: TRY_AGAIN };
  const { cityId, cursor, promoOnly, where } = parsed.data;

  const accessToken = await getAccessToken();
  try {
    const page = await getCommunityFeed({
      cityId,
      promoOnly,
      limit: FEED_PAGE_SIZE_DEFAULT,
      ...(accessToken ? { accessToken } : {}),
      ...(cursor ? { cursor } : {}),
      ...(where
        ? {
            where: {
              lat: where.lat,
              lng: where.lng,
              ...(where.radiusM !== undefined ? { radiusM: where.radiusM } : {}),
            },
          }
        : {}),
    });
    return { ok: true, ...page };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}
