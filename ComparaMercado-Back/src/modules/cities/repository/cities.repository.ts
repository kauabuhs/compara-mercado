import { z } from "zod";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import type { CitiesRepository, CityRecord } from "../cities.types";

interface PgError {
  message: string;
  code?: string;
}

function throwIfError(operation: string, error: PgError | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

// O tipo gerado do RPC não conhece colunas anuláveis do retorno; o schema é a fonte de verdade.
const SearchRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  uf: z.string(),
  ibge_code: z.string().nullable(),
  store_count: z.coerce.number().int(),
  center_lat: z.number().nullable(),
  center_lng: z.number().nullable(),
});

const CityRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  uf: z.string().nullable(),
  ibge_code: z.string().nullable(),
  center_lat: z.number().nullable(),
  center_lng: z.number().nullable(),
});

/** Leitura da biblioteca com a chave pública: as cidades são dado de referência legível por todos. */
export function createCitiesRepository(publicDb: Db): CitiesRepository {
  return {
    async search({ q, uf, limit }) {
      const { data, error } = await publicDb.rpc("search_cities", {
        p_query: q,
        p_limit: limit,
        ...(uf ? { p_uf: uf } : {}),
      });
      throwIfError("cities.search", error);
      return z
        .array(SearchRowSchema)
        .parse(data ?? [])
        .map(
          (row): CityRecord => ({
            id: row.id,
            name: row.name,
            uf: row.uf,
            ibgeCode: row.ibge_code,
            storeCount: row.store_count,
            centerLat: row.center_lat,
            centerLng: row.center_lng,
          }),
        );
    },

    async find(cityId) {
      const [cityResult, storesResult] = await Promise.all([
        publicDb
          .from("cities")
          .select("id,name,uf,ibge_code,center_lat,center_lng")
          .eq("id", cityId)
          .maybeSingle(),
        publicDb
          .from("stores")
          .select("id", { count: "exact", head: true })
          .eq("city_id", cityId)
          .eq("status", "active"),
      ]);
      throwIfError("cities.find", cityResult.error);
      throwIfError("cities.find.stores", storesResult.error);
      if (!cityResult.data) return null;
      const row = CityRowSchema.parse(cityResult.data);
      return {
        id: row.id,
        name: row.name,
        uf: row.uf ?? "",
        ibgeCode: row.ibge_code,
        storeCount: storesResult.count ?? 0,
        centerLat: row.center_lat,
        centerLng: row.center_lng,
      };
    },
  };
}
