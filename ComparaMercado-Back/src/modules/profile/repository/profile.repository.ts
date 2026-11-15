import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import type { ProfilePatch, ProfileRecord, ProfileRepository } from "../profile.types";

const COLUMNS =
  "display_name, public_nickname, phone, city_id, terms_version, terms_accepted_at, created_at";

interface ProfileRow {
  display_name: string | null;
  public_nickname: string | null;
  phone: string | null;
  city_id: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
  created_at: string;
}

function toRecord(row: ProfileRow): ProfileRecord {
  return {
    displayName: row.display_name,
    publicNickname: row.public_nickname,
    phone: row.phone,
    cityId: row.city_id,
    termsVersion: row.terms_version,
    termsAcceptedAt: row.terms_accepted_at,
    createdAt: row.created_at,
  };
}

function throwIfError(operation: string, error: { message: string; code?: string } | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

/**
 * Persistência do módulo, sempre com o cliente do próprio usuário: a RLS (`profiles_read`,
 * `profiles_update_self`) e os grants de coluna são a barreira. Só nome, telefone e cidade são
 * graváveis; papel, reputação e aceite dos termos o banco recusa mesmo que o código tentasse.
 */
export function createProfileRepository(userDb: Db): ProfileRepository {
  return {
    async find(userId) {
      const { data, error } = await userDb
        .from("profiles")
        .select(COLUMNS)
        .eq("id", userId)
        .maybeSingle();
      throwIfError("profile.find", error);
      return data ? toRecord(data) : null;
    },

    async update(userId, patch: ProfilePatch) {
      const changes: {
        display_name?: string | null;
        public_nickname?: string | null;
        phone?: string | null;
        city_id?: string | null;
      } = {};
      if (patch.displayName !== undefined) changes.display_name = patch.displayName;
      if (patch.publicNickname !== undefined) changes.public_nickname = patch.publicNickname;
      if (patch.phone !== undefined) changes.phone = patch.phone;
      if (patch.cityId !== undefined) changes.city_id = patch.cityId;

      const { data, error } = await userDb
        .from("profiles")
        .update(changes)
        .eq("id", userId)
        .select(COLUMNS)
        .maybeSingle();
      throwIfError("profile.update", error);
      return data ? toRecord(data) : null;
    },

    async cityExists(cityId) {
      const { data, error } = await userDb
        .from("cities")
        .select("id")
        .eq("id", cityId)
        .maybeSingle();
      throwIfError("profile.cityExists", error);
      return data !== null;
    },
  };
}
