import type { City, CityDetail } from "@contracts";
import { cookies } from "next/headers";
import { z } from "zod";
import { getCity, getMyProfile, listCities } from "@/services/api/endpoints";
import { getAccessToken } from "./session";

/** Cookie com a cidade escolhida (só o servidor lê; o navegador nunca precisa dele). */
export const CITY_COOKIE = "compara-cidade";
export const CITY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface CitySelection {
  /** Atalhos do seletor: as cidades que já têm mercados (habilitadas no comparador). */
  cities: City[];
  /**
   * Cidade em uso, ou `null` quando ainda não escolheu (e há mais de uma para escolher). Pode ser
   * qualquer município da biblioteca, inclusive um sem mercados ainda (`coverage: "coming_soon"`).
   */
  selected: CityDetail | null;
}

/**
 * Cidade em uso, por ordem de precedência: cookie → cidade preferida do perfil (quem está logado)
 * → a única cidade habilitada (piloto). Nunca confia no que veio do cookie: só vale se o id for
 * de uma cidade que existe na biblioteca. Falha do perfil não derruba a página (cai para "sem
 * escolha").
 */
export async function getCitySelection(): Promise<CitySelection> {
  const cities = await listCities();

  const cookieValue = (await cookies()).get(CITY_COOKIE)?.value;
  const fromCookie = z.uuid().safeParse(cookieValue);
  if (fromCookie.success) {
    const cookieCity = await getCity(fromCookie.data);
    if (cookieCity) return { cities, selected: cookieCity };
  }

  const accessToken = await getAccessToken();
  if (accessToken) {
    try {
      const profile = await getMyProfile(accessToken);
      const profileCity = profile.cityId ? await getCity(profile.cityId) : null;
      if (profileCity) return { cities, selected: profileCity };
    } catch {
      // sem perfil, segue sem cidade escolhida
    }
  }

  const [onlyCity] = cities;
  if (cities.length === 1 && onlyCity) {
    return { cities, selected: await getCity(onlyCity.id) };
  }
  return { cities, selected: null };
}
