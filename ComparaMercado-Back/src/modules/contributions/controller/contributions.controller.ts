import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  apiRoutes,
  ContributionFieldsSchema,
  MAX_CONTRIBUTION_PHOTO_BYTES,
  MyContributionsQuerySchema,
} from "../../../contracts";
import { DomainError } from "../../../lib/domain-error";
import { requireUser } from "../../../middlewares/auth";
import { type AppEnv, parseQuery } from "../../../middlewares/context";
import { ApiError, errors } from "../../../middlewares/errors";
import type { RateLimiter } from "../../../middlewares/rate-limit";
import type { Authenticator } from "../../auth/auth.types";
import type { ContributionErrorCode, ContributionServiceFactory } from "../contributions.types";

export interface ContributionRoutesDeps {
  authenticator: Authenticator;
  contributionsFor: ContributionServiceFactory;
  /** Limite por usuário (não por IP): várias pessoas atrás do mesmo Wi-Fi não se bloqueiam. */
  submitRateLimiter: RateLimiter;
}

/** Folga para os campos de texto e as divisórias do multipart, além da foto. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const CONTRIBUTION_BODY_LIMIT_BYTES =
  MAX_CONTRIBUTION_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES;

const STATUS_BY_CODE: Record<ContributionErrorCode, number> = {
  invalid_photo: 400,
  invalid_target: 400,
  duplicate_photo: 409,
  daily_limit: 429,
};

function toApiError(error: unknown): unknown {
  if (error instanceof DomainError && error.code in STATUS_BY_CODE) {
    return new ApiError(
      STATUS_BY_CODE[error.code as ContributionErrorCode],
      error.code,
      error.message,
    );
  }
  return error;
}

/** Envio de preço com foto e histórico do próprio usuário. Exige login (qualquer papel). */
export function contributionRoutes({
  authenticator,
  contributionsFor,
  submitRateLimiter,
}: ContributionRoutesDeps) {
  const routes = new Hono<AppEnv>();
  const requireLogin = requireUser(authenticator);

  routes.post(
    apiRoutes.contributions,
    requireLogin,
    // Substitui o limite global de 64 KB só nesta rota (o app o dispensa para ela).
    bodyLimit({
      maxSize: CONTRIBUTION_BODY_LIMIT_BYTES,
      onError: () => {
        throw new ApiError(413, "payload_too_large", "A foto é grande demais.");
      },
    }),
    async (c) => {
      const user = c.get("user");
      const verdict = submitRateLimiter.check(user.id);
      if (!verdict.ok) {
        throw errors.rateLimited(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)));
      }

      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        throw errors.invalidRequest("O envio precisa ser um formulário com a foto.");
      }
      const photo = form.get("photo");
      if (!(photo instanceof File) || photo.size === 0) {
        throw errors.invalidRequest("Envie a foto da etiqueta.");
      }
      if (photo.size > MAX_CONTRIBUTION_PHOTO_BYTES) {
        throw new ApiError(413, "payload_too_large", "A foto é grande demais.");
      }
      const fields = ContributionFieldsSchema.safeParse({
        storeId: form.get("storeId"),
        productId: form.get("productId"),
        priceCents: form.get("priceCents"),
        promo: form.get("promo") ?? undefined,
      });
      if (!fields.success) throw errors.invalidRequest();

      try {
        const created = await contributionsFor(c.get("accessToken")).submit(user.id, {
          ...fields.data,
          photo: new Uint8Array(await photo.arrayBuffer()),
        });
        return c.json(created, 201);
      } catch (error) {
        throw toApiError(error);
      }
    },
  );

  routes.get(apiRoutes.myContributions, requireLogin, async (c) => {
    const query = parseQuery(c, MyContributionsQuerySchema);
    const { items, total } = await contributionsFor(c.get("accessToken")).listMine(
      c.get("user").id,
      query,
    );
    return c.json({ contributions: items, total, page: query.page, pageSize: query.pageSize });
  });

  return routes;
}
