"use server";

import {
  ManualPriceRequestSchema,
  ModerationActionSchema,
  ReviewDecisionSchema,
  ReviewNoteSchema,
} from "@contracts";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getAccessToken } from "@/server/session";
import { ApiRequestError, CATALOG_CACHE_TAG } from "@/services/api/client";
import {
  createManualPrice as sendManualPrice,
  resolveModerationTask as sendModeration,
  reviewObservation as sendReview,
} from "@/services/api/endpoints";

// Esta camada só valida o formulário (UX) e repassa à API. Quem autoriza é o back-end (papel
// `admin` + RLS): aqui não há regra de negócio nem acesso a dados.

export type ActionState = { ok: boolean; message: string };

async function requireAccessToken(): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("não autorizado");
  return accessToken;
}

function isAuthorizationFailure(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

const PriceFormSchema = z.object({
  storeId: z.uuid(),
  productId: z.uuid(),
  // Aceita "5,99" ou "5.99"; o contrato com a API usa centavos inteiros.
  priceCents: z
    .string()
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,2})?$/, "Preço inválido")
    .transform((formattedPrice) => Math.round(Number(formattedPrice.replace(",", ".")) * 100)),
  promo: z.boolean(),
  validTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function createManualPrice(_prev: ActionState, form: FormData): Promise<ActionState> {
  const accessToken = await requireAccessToken();
  const parsedForm = PriceFormSchema.safeParse({
    storeId: form.get("storeId"),
    productId: form.get("productId"),
    priceCents: form.get("price"),
    promo: form.get("promo") === "on",
    validTo: form.get("validTo") || undefined,
  });
  if (!parsedForm.success) return { ok: false, message: "Confira os campos do formulário." };
  if (parsedForm.data.priceCents <= 0) {
    return { ok: false, message: "O preço deve ser maior que zero." };
  }

  const request = ManualPriceRequestSchema.safeParse(parsedForm.data);
  if (!request.success) return { ok: false, message: "Confira os campos do formulário." };

  try {
    await sendManualPrice(accessToken, request.data);
  } catch (error) {
    if (isAuthorizationFailure(error)) throw new Error("não autorizado");
    return { ok: false, message: "Não foi possível salvar o preço." };
  }

  // Zera o cache de dados do Next já (o admin vê o preço novo ao voltar às páginas públicas).
  updateTag(CATALOG_CACHE_TAG);
  revalidatePath("/", "layout");
  return { ok: true, message: "Preço salvo e publicado." };
}

/** Motivo do formulário de rejeição (campo `reason`); vazio ou fora do tamanho = sem motivo. */
function readNote(form: FormData | undefined): string | undefined {
  const parsed = ReviewNoteSchema.safeParse(form?.get("reason"));
  return parsed.success ? parsed.data : undefined;
}

export async function reviewObservation(
  observationId: string,
  decision: "approved" | "rejected",
  form?: FormData,
): Promise<void> {
  const accessToken = await requireAccessToken();
  const safeObservationId = z.uuid().parse(observationId);
  const safeDecision = ReviewDecisionSchema.parse(decision);
  try {
    await sendReview(
      accessToken,
      safeObservationId,
      safeDecision,
      safeDecision === "rejected" ? readNote(form) : undefined,
    );
  } catch (error) {
    if (isAuthorizationFailure(error)) throw new Error("não autorizado");
    throw new Error("falha ao revisar");
  }
  // Aprovar publica o preço: zera o cache do catálogo para ele aparecer nas páginas públicas já.
  if (safeDecision === "approved") {
    updateTag(CATALOG_CACHE_TAG);
    revalidatePath("/", "layout");
  }
  revalidatePath("/admin");
}

/**
 * Decide uma tarefa de moderação (preço denunciado ou contestado): aprovar, rejeitar/retirar o
 * preço (com motivo) ou mantê-lo. Aprovar e rejeitar mudam o que está publicado, então o cache do
 * catálogo é zerado.
 */
export async function decideModeration(
  taskId: string,
  action: "approve" | "reject" | "keep",
  form?: FormData,
): Promise<void> {
  const accessToken = await requireAccessToken();
  const safeTaskId = z.uuid().parse(taskId);
  const safeAction = ModerationActionSchema.parse(action);
  try {
    await sendModeration(accessToken, safeTaskId, {
      action: safeAction,
      ...(safeAction === "reject" ? { note: readNote(form) } : {}),
    });
  } catch (error) {
    if (isAuthorizationFailure(error)) throw new Error("não autorizado");
    // 404 = outra pessoa já encerrou a tarefa: a lista recarregada abaixo já a mostra como resolvida
    if (!(error instanceof ApiRequestError && error.status === 404)) {
      throw new Error("falha ao decidir a tarefa");
    }
  }
  if (safeAction !== "keep") {
    updateTag(CATALOG_CACHE_TAG);
    revalidatePath("/", "layout");
  }
  revalidatePath("/admin", "layout");
}
