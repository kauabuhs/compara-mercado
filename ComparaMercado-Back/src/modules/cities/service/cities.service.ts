import type { CityDetail } from "../../../contracts";
import type { CitiesRepository, CitiesService, CityRecord } from "../cities.types";

/** Cobertura: com ao menos um mercado ativo a cidade está disponível; senão, "em breve". */
function toDetail(record: CityRecord): CityDetail {
  return {
    id: record.id,
    name: record.name,
    uf: record.uf,
    ibgeCode: record.ibgeCode,
    storeCount: record.storeCount,
    coverage: record.storeCount > 0 ? "available" : "coming_soon",
    centerLat: record.centerLat,
    centerLng: record.centerLng,
  };
}

export function createCitiesService(repository: CitiesRepository): CitiesService {
  return {
    async search(query) {
      return (await repository.search(query)).map(toDetail);
    },

    async get(cityId) {
      const record = await repository.find(cityId);
      return record ? toDetail(record) : null;
    },
  };
}
