import type { CityDetail, CitySearchQuery } from "../../contracts";

/**
 * Biblioteca de cidades (ADR-0014): todos os municípios do IBGE, legíveis por qualquer pessoa.
 * Escolher uma cidade é uma preferência pessoal (cookie/perfil); a cidade só é habilitada no
 * comparador quando aparece a primeira loja ativa (gatilho no banco). Por isso o módulo só lê.
 */
export interface CitiesService {
  /** Busca por nome (sem acento, tolerante a erro de digitação) e/ou UF; ver `CitySearchQuery`. */
  search(query: CitySearchQuery): Promise<CityDetail[]>;
  /** `null` quando a cidade não existe na biblioteca. */
  get(cityId: string): Promise<CityDetail | null>;
}

/** Linha da biblioteca como o repositório a entrega (sem cobertura calculada). */
export interface CityRecord {
  id: string;
  name: string;
  uf: string;
  ibgeCode: string | null;
  storeCount: number;
  centerLat: number | null;
  centerLng: number | null;
}

/** Acesso a dados do módulo: a única camada que conhece `cities`, `stores` e `search_cities`. */
export interface CitiesRepository {
  search(query: CitySearchQuery): Promise<CityRecord[]>;
  find(cityId: string): Promise<CityRecord | null>;
}
