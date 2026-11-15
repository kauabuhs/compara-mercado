import { Hono, type MiddlewareHandler } from "hono";
import {
  apiRoutes,
  CommunityFeedQuerySchema,
  ConfirmObservationRequestSchema,
  ReportObservationRequestSchema,
} from "../../../contracts";
import { DomainError } from "../../../lib/domain-error";
import { requireUser } from "../../../middlewares/auth";
import {
  type AppEnv,
  getClientIp,
  parseJsonBody,
  parseQuery,
  parseUuidParam,
} from "../../../middlewares/context";
import { ApiError, errors } from "../../../middlewares/errors";
import type { RateLimiter } from "../../../middlewares/rate-limit";
import { responseCache } from "../../../middlewares/response-cache";
import type { Authenticator } from "../../auth/auth.types";
import type { CommunityErrorCode, CommunityServiceFactory } from "../community.types";

export interface CommunityRoutesDeps {
  authenticator: Authenticator;
  communityFor: CommunityServiceFactory;
  /** Limite por usuário (não por IP) para confirmar publicações. */
  confirmRateLimiter: RateLimiter;
  /** Limite por usuário para denunciar. */
  reportRateLimiter: RateLimiter;
  /** Limite por IP para o feed que chega ao banco (com sessão ou posição, sem cache compartilhado). */
  feedRateLimiter: RateLimiter;
  /** Limite por usuário para ler fotos (generoso: cada página do feed baixa várias). */
  photoRateLimiter: RateLimiter;
}

/** O feed anônimo e sem posição é igual para todo mundo: 15 s de cache por instância bastam. */
const FEED_CACHE_SECONDS = 15;
const PHOTO_CACHE_CONTROL = "private, max-age=60";
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

const STATUS_BY_CODE: Record<CommunityErrorCode, number> = {
  invalid_cursor: 400,
  observation_unavailable: 404,
  own_observation: 403,
  already_done: 409,
  daily_limit: 429,
};

function toApiError(error: unknown): unknown {
  if (error instanceof DomainError && error.code in STATUS_BY_CODE) {
    return new ApiError(
      STATUS_BY_CODE[error.code as CommunityErrorCode],
      error.code,
      error.message,
    );
  }
  return error;
}

/**
 * Comunidade: feed público da cidade; confirmar, denunciar, ver a foto e a reputação exigem login.
 * As regras de corroboração e os tetos de abuso estão no banco; aqui há só HTTP.
 */
export function communityRoutes({
  authenticator,
  communityFor,
  confirmRateLimiter,
  reportRateLimiter,
  feedRateLimiter,
  photoRateLimiter,
}: CommunityRoutesDeps) {
  const routes = new Hono<AppEnv>();
  const requireLogin = requireUser(authenticator);

  const sharedFeedCache = responseCache({ ttlSeconds: FEED_CACHE_SECONDS });
  const feedCache: MiddlewareHandler<AppEnv> = async (c, next) => {
    const personal =
      c.req.header("authorization") !== undefined || c.req.query("lat") !== undefined;
    if (personal) {
      // O que não vem do cache compartilhado roda o SQL do feed: precisa de teto por origem.
      const verdict = feedRateLimiter.check(getClientIp(c));
      if (!verdict.ok) {
        throw errors.rateLimited(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)));
      }
      await next();
      c.header("cache-control", "private, no-store");
      return undefined;
    }
    return sharedFeedCache(c, next);
  };

  routes.get(apiRoutes.communityFeed, feedCache, async (c) => {
    const query = parseQuery(c, CommunityFeedQuerySchema);

    // Login é opcional aqui: com sessão válida o feed marca "é meu" e o voto do usuário.
    const token = c.req.header("authorization")?.match(BEARER_PATTERN)?.[1];
    const user = token ? await authenticator.authenticate(token) : null;
    const service = communityFor(user && token ? token : null);

    try {
      const page = await service.feed({
        cityId: query.cityId,
        ...(query.lat !== undefined && query.lng !== undefined
          ? {
              where: {
                lat: query.lat,
                lng: query.lng,
                ...(query.radiusM !== undefined ? { radiusM: query.radiusM } : {}),
              },
            }
          : {}),
        promoOnly: query.promo,
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        limit: query.limit,
      });
      return c.json(page);
    } catch (error) {
      throw toApiError(error);
    }
  });

  routes.post(apiRoutes.communityConfirm(":observationId"), requireLogin, async (c) => {
    const user = c.get("user");
    const verdict = confirmRateLimiter.check(user.id);
    if (!verdict.ok) throw errors.rateLimited(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)));

    const observationId = parseUuidParam(c, "observationId");
    const body = await parseJsonBody(c, ConfirmObservationRequestSchema);
    try {
      const result = await communityFor(c.get("accessToken")).confirm(observationId, body.verdict);
      return c.json(result);
    } catch (error) {
      throw toApiError(error);
    }
  });

  routes.post(apiRoutes.communityReport(":observationId"), requireLogin, async (c) => {
    const user = c.get("user");
    const verdict = reportRateLimiter.check(user.id);
    if (!verdict.ok) throw errors.rateLimited(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)));

    const observationId = parseUuidParam(c, "observationId");
    const body = await parseJsonBody(c, ReportObservationRequestSchema);
    try {
      await communityFor(c.get("accessToken")).report(observationId, body.reason);
      return c.json({ ok: true }, 201);
    } catch (error) {
      throw toApiError(error);
    }
  });

  routes.get(apiRoutes.communityPhoto(":observationId"), requireLogin, async (c) => {
    const verdict = photoRateLimiter.check(c.get("user").id);
    if (!verdict.ok) throw errors.rateLimited(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)));
    const observationId = parseUuidParam(c, "observationId");
    const photo = await communityFor(c.get("accessToken")).getPhoto(observationId);
    if (!photo) throw errors.notFound("Foto não encontrada.");
    return c.body(photo as Uint8Array<ArrayBuffer>, 200, {
      "content-type": "image/jpeg",
      "cache-control": PHOTO_CACHE_CONTROL,
    });
  });

  routes.get(apiRoutes.myReputation, requireLogin, async (c) =>
    c.json(await communityFor(c.get("accessToken")).reputation(c.get("user").id)),
  );

  return routes;
}
