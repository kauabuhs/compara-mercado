import { Hono } from "hono";
import { apiRoutes, UpdateProfileRequestSchema } from "../../../contracts";
import { DomainError } from "../../../lib/domain-error";
import { requireUser } from "../../../middlewares/auth";
import { type AppEnv, parseJsonBody } from "../../../middlewares/context";
import { ApiError } from "../../../middlewares/errors";
import type { Authenticator } from "../../auth/auth.types";
import type { ProfileErrorCode, ProfileServiceFactory } from "../profile.types";

export interface ProfileRoutesDeps {
  authenticator: Authenticator;
  profileFor: ProfileServiceFactory;
}

const STATUS_BY_CODE: Record<ProfileErrorCode, number> = {
  invalid_phone: 400,
  invalid_city: 400,
  nickname_unavailable: 409,
  profile_not_found: 404,
};

function toApiError(error: unknown): unknown {
  if (error instanceof DomainError && error.code in STATUS_BY_CODE) {
    return new ApiError(STATUS_BY_CODE[error.code as ProfileErrorCode], error.code, error.message);
  }
  return error;
}

/** Dados da própria conta. Exige login (qualquer papel); cada pessoa só enxerga e edita o seu. */
export function profileRoutes({ authenticator, profileFor }: ProfileRoutesDeps) {
  const routes = new Hono<AppEnv>();
  const requireLogin = requireUser(authenticator);

  routes.get(apiRoutes.myProfile, requireLogin, async (c) => {
    try {
      return c.json(await profileFor(c.get("accessToken")).get(c.get("user")));
    } catch (error) {
      throw toApiError(error);
    }
  });

  routes.patch(apiRoutes.myProfile, requireLogin, async (c) => {
    const input = await parseJsonBody(c, UpdateProfileRequestSchema);
    try {
      const profile = await profileFor(c.get("accessToken")).update(c.get("user"), input);
      // `/v1/me` fica em cache por poucos segundos: esquece esta sessão para o novo nome aparecer já.
      authenticator.forget?.(c.get("accessToken"));
      return c.json(profile);
    } catch (error) {
      throw toApiError(error);
    }
  });

  return routes;
}
