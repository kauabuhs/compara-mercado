import type { Profile, SessionUser, UpdateProfileRequest } from "../../../contracts";
import { DbError } from "../../../database/errors";
import { DomainError } from "../../../lib/domain-error";
import { normalizePhone } from "../../../lib/phone";
import type {
  ProfilePatch,
  ProfileRecord,
  ProfileRepository,
  ProfileService,
} from "../profile.types";

type SessionIdentity = Pick<SessionUser, "id" | "email">;

function toProfile(user: SessionIdentity, record: ProfileRecord): Profile {
  return { email: user.email, ...record };
}

/** Violação de chave estrangeira: a cidade sumiu entre a checagem e a gravação. */
const FOREIGN_KEY_VIOLATION = "23503";
/** Apelido repetido (índice único) ou reservado (check): ambos pedem escolher outro. */
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

export function createProfileService(repository: ProfileRepository): ProfileService {
  async function load(user: SessionIdentity): Promise<ProfileRecord> {
    const record = await repository.find(user.id);
    if (!record) throw new DomainError("profile_not_found", "Perfil não encontrado.");
    return record;
  }

  return {
    async get(user) {
      return toProfile(user, await load(user));
    },

    async update(user, input: UpdateProfileRequest) {
      const patch: ProfilePatch = {};
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.publicNickname !== undefined) patch.publicNickname = input.publicNickname;

      if (input.phone !== undefined) {
        // `null`/texto vazio apaga; senão precisa virar um número E.164 válido.
        const phone = input.phone === null ? null : normalizePhone(input.phone);
        if (phone === undefined) {
          throw new DomainError(
            "invalid_phone",
            "Telefone inválido. Use o DDD e o número, por exemplo (54) 99999-0000.",
          );
        }
        patch.phone = phone;
      }

      if (input.cityId !== undefined) {
        if (input.cityId !== null && !(await repository.cityExists(input.cityId))) {
          throw new DomainError("invalid_city", "Cidade indisponível.");
        }
        patch.cityId = input.cityId;
      }

      let updated: ProfileRecord | null;
      try {
        updated = await repository.update(user.id, patch);
      } catch (error) {
        if (error instanceof DbError && error.code === FOREIGN_KEY_VIOLATION) {
          throw new DomainError("invalid_city", "Cidade indisponível.", { cause: error });
        }
        if (
          error instanceof DbError &&
          (error.code === UNIQUE_VIOLATION || error.code === CHECK_VIOLATION) &&
          error.message.includes("public_nickname")
        ) {
          throw new DomainError(
            "nickname_unavailable",
            "Esse apelido não está disponível. Escolha outro.",
            { cause: error },
          );
        }
        throw error;
      }
      if (!updated) throw new DomainError("profile_not_found", "Perfil não encontrado.");
      return toProfile(user, updated);
    },
  };
}
