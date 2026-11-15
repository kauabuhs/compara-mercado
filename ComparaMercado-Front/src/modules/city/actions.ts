"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { CITY_COOKIE, CITY_COOKIE_MAX_AGE_SECONDS } from "@/server/city";
import { getAccessToken } from "@/server/session";
import { ApiRequestError, ApiUnavailableError } from "@/services/api/client";
import { updateMyProfile } from "@/services/api/endpoints";

// Camada fina: guarda a cidade escolhida em cookie (vale para visitantes) e, quando há sessão,
// também no perfil (vale em outros aparelhos). A API valida se a cidade existe e está habilitada.

export type SelectCityResult = { ok: true } | { ok: false; message: string };

export async function selectCityAction(cityId: string): Promise<SelectCityResult> {
  const parsed = z.uuid().safeParse(cityId);
  if (!parsed.success) return { ok: false, message: "Escolha uma cidade da lista." };

  const accessToken = await getAccessToken();
  if (accessToken) {
    try {
      await updateMyProfile(accessToken, { cityId: parsed.data });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "invalid_city") {
        return { ok: false, message: "Essa cidade não está disponível." };
      }
      // Perfil indisponível não impede de usar a cidade neste aparelho (o cookie abaixo cobre).
      if (!(error instanceof ApiRequestError || error instanceof ApiUnavailableError)) throw error;
    }
  }

  (await cookies()).set(CITY_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: CITY_COOKIE_MAX_AGE_SECONDS,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
