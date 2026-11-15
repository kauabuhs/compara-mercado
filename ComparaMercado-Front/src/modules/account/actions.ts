"use server";

import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  PUBLIC_NICKNAME_MAX,
  PUBLIC_NICKNAME_MIN,
  PUBLIC_NICKNAME_PATTERN,
} from "@contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccessToken } from "@/server/session";
import { ApiRequestError, ApiUnavailableError } from "@/services/api/client";
import { updateMyProfile } from "@/services/api/endpoints";

// Camada fina: valida o formulário (UX) e repassa à API, que revalida, normaliza o telefone e
// aplica a RLS. Só nome, telefone e cidade são editáveis; papel e aceite dos termos nunca.

export interface ProfileFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"displayName" | "publicNickname" | "phone" | "cityId", string>>;
}

/** Erros da API cuja mensagem (pt-BR, escrita para o usuário) pode ser mostrada como está. */
const USER_FACING_API_CODES = new Set([
  "invalid_phone",
  "invalid_city",
  "nickname_unavailable",
  "rate_limited",
]);

const FIELD_BY_API_CODE: Record<string, "phone" | "cityId" | "publicNickname"> = {
  invalid_phone: "phone",
  invalid_city: "cityId",
  nickname_unavailable: "publicNickname",
};

const NICKNAME_MESSAGE = `Use de ${PUBLIC_NICKNAME_MIN} a ${PUBLIC_NICKNAME_MAX} caracteres: letras, números, espaço, ponto, hífen ou _.`;

const failure = (
  message: string,
  fieldErrors?: ProfileFormState["fieldErrors"],
): ProfileFormState => ({
  status: "error",
  message,
  ...(fieldErrors ? { fieldErrors } : {}),
});

export async function updateProfileAction(
  _previous: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const accessToken = await getAccessToken();
  if (!accessToken) return failure("Sua sessão expirou. Entre de novo para continuar.");

  const displayName = z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN)
    .max(DISPLAY_NAME_MAX)
    .safeParse(String(form.get("displayName") ?? ""));
  if (!displayName.success) {
    const message = `Use de ${DISPLAY_NAME_MIN} a ${DISPLAY_NAME_MAX} caracteres.`;
    return failure(message, { displayName: message });
  }
  // Apelido público: vazio apaga (volta a "Colaborador #XXXX"); senão precisa passar no formato.
  const nickname = String(form.get("publicNickname") ?? "").trim();
  if (
    nickname !== "" &&
    !(
      nickname.length >= PUBLIC_NICKNAME_MIN &&
      nickname.length <= PUBLIC_NICKNAME_MAX &&
      PUBLIC_NICKNAME_PATTERN.test(nickname)
    )
  ) {
    return failure(NICKNAME_MESSAGE, { publicNickname: NICKNAME_MESSAGE });
  }
  const phone = String(form.get("phone") ?? "").trim();
  const cityId = String(form.get("cityId") ?? "");
  if (cityId !== "" && !z.uuid().safeParse(cityId).success) {
    return failure("Escolha uma cidade da lista.", { cityId: "Escolha uma cidade da lista." });
  }

  try {
    await updateMyProfile(accessToken, {
      displayName: displayName.data,
      publicNickname: nickname === "" ? null : nickname,
      phone: phone === "" ? null : phone,
      cityId: cityId === "" ? null : cityId,
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) return failure("Sua sessão expirou. Entre de novo para continuar.");
      if (USER_FACING_API_CODES.has(error.code)) {
        const field = FIELD_BY_API_CODE[error.code];
        return field ? failure(error.message, { [field]: error.message }) : failure(error.message);
      }
      console.error("edição de perfil recusada pela API", error.status, error.code);
    } else if (!(error instanceof ApiUnavailableError)) {
      throw error;
    }
    return failure("Não foi possível salvar agora. Tente de novo em instantes.");
  }

  revalidatePath("/conta", "layout");
  return { status: "saved", message: "Dados salvos." };
}
