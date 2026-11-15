import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { apiRoutes } from "./contracts";
import { DbError } from "./database/errors";
import type { Logger } from "./lib/logger";
import type { AppEnv } from "./middlewares/context";
import { ApiError, errors } from "./middlewares/errors";
import { RateLimiter } from "./middlewares/rate-limit";
import { adminRoutes } from "./modules/admin/controller/admin.controller";
import { accountRoutes } from "./modules/auth/controller/auth.controller";
import { catalogRoutes } from "./modules/catalog/controller/catalog.controller";
import { citiesRoutes } from "./modules/cities/controller/cities.controller";
import { communityRoutes } from "./modules/community/controller/community.controller";
import { contributionRoutes } from "./modules/contributions/controller/contributions.controller";
import { myListRoutes } from "./modules/my-list/controller/my-list.controller";
import { profileRoutes } from "./modules/profile/controller/profile.controller";
import { registryRoutes } from "./modules/registry/controller/registry.controller";
import type { Services } from "./services";

const MAX_BODY_BYTES = 64 * 1024;
const COMPARE_MAX_REQUESTS_PER_MINUTE = 30;
const CITY_SEARCH_MAX_REQUESTS_PER_MINUTE = 120;
const SUBMIT_MAX_REQUESTS_PER_MINUTE = 6;
const CONFIRM_MAX_REQUESTS_PER_MINUTE = 30;
const REPORT_MAX_REQUESTS_PER_MINUTE = 10;
const FEED_MAX_REQUESTS_PER_MINUTE = 120;
const PHOTO_MAX_REQUESTS_PER_MINUTE = 300;
const LIST_SYNC_MAX_REQUESTS_PER_MINUTE = 60;
const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

export interface AppDependencies {
  services: Services;
  logger: Logger;
  /** Permite ajustar o limite em testes; em produção usa o padrão. */
  compareRateLimiter?: RateLimiter;
  /** Idem, para a busca na biblioteca de cidades (roda a cada tecla no seletor). */
  citySearchRateLimiter?: RateLimiter;
  /** Idem, para o envio de preço com foto (limite por usuário). */
  submitRateLimiter?: RateLimiter;
  /** Idem, para confirmar publicações da comunidade (limite por usuário). */
  confirmRateLimiter?: RateLimiter;
  /** Idem, para denúncias (limite por usuário). */
  reportRateLimiter?: RateLimiter;
  /** Idem, para o feed da comunidade quando não vem do cache compartilhado (limite por IP). */
  feedRateLimiter?: RateLimiter;
  /** Idem, para fotos da comunidade (limite por usuário). */
  photoRateLimiter?: RateLimiter;
  /** Limite de sincronizações da lista de compras, por usuário (testes injetam um mais curto). */
  listSyncRateLimiter?: RateLimiter;
}

/** Monta a API. Não abre porta nem lê ambiente: quem sobe o servidor é o `index.ts`. */
export function createApp({
  services,
  logger,
  compareRateLimiter,
  citySearchRateLimiter,
  submitRateLimiter,
  confirmRateLimiter,
  reportRateLimiter,
  feedRateLimiter,
  photoRateLimiter,
  listSyncRateLimiter,
}: AppDependencies) {
  const app = new Hono<AppEnv>();

  app.use(secureHeaders());
  // Só comprime quando o cliente pede (accept-encoding) e a resposta passa de 1 KB: ofertas e
  // busca são JSON repetitivo e encolhem bastante no trajeto até o servidor do Next.
  app.use(compress());
  app.use(async (c, next) => {
    const incomingId = c.req.header("x-request-id");
    const requestId = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    const startedAt = performance.now();
    await next();
    logger.info(
      {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "requisição",
    );
  });
  const defaultBodyLimit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new ApiError(413, "payload_too_large", "Requisição grande demais.");
    },
  });
  // O envio de foto tem limite próprio (maior), aplicado dentro da rota; as demais ficam em 64 KB.
  app.use(async (c, next) =>
    c.req.method === "POST" && c.req.path === apiRoutes.contributions
      ? next()
      : defaultBodyLimit(c, next),
  );

  app.get(apiRoutes.health, (c) => c.json({ status: "ok" }));

  app.route(
    "/",
    catalogRoutes({
      catalog: services.catalog,
      compareRateLimiter:
        compareRateLimiter ?? new RateLimiter(COMPARE_MAX_REQUESTS_PER_MINUTE, 60_000),
    }),
  );
  app.route(
    "/",
    citiesRoutes({
      cities: services.cities,
      searchRateLimiter:
        citySearchRateLimiter ?? new RateLimiter(CITY_SEARCH_MAX_REQUESTS_PER_MINUTE, 60_000),
    }),
  );
  app.route("/", accountRoutes(services.authenticator));
  app.route(
    "/",
    profileRoutes({ authenticator: services.authenticator, profileFor: services.profileFor }),
  );
  app.route(
    "/",
    adminRoutes({ authenticator: services.authenticator, adminFor: services.adminFor }),
  );
  // Tem a própria guarda (login + admin): o `authenticator` guarda em cache, então repetir é barato.
  app.route(
    "/",
    registryRoutes({
      authenticator: services.authenticator,
      registryFor: services.registryFor,
    }),
  );
  app.route(
    "/",
    contributionRoutes({
      authenticator: services.authenticator,
      contributionsFor: services.contributionsFor,
      submitRateLimiter:
        submitRateLimiter ?? new RateLimiter(SUBMIT_MAX_REQUESTS_PER_MINUTE, 60_000),
    }),
  );

  app.route(
    "/",
    myListRoutes({
      authenticator: services.authenticator,
      myListFor: services.myListFor,
      syncRateLimiter:
        listSyncRateLimiter ?? new RateLimiter(LIST_SYNC_MAX_REQUESTS_PER_MINUTE, 60_000),
    }),
  );

  app.route(
    "/",
    communityRoutes({
      authenticator: services.authenticator,
      communityFor: services.communityFor,
      confirmRateLimiter:
        confirmRateLimiter ?? new RateLimiter(CONFIRM_MAX_REQUESTS_PER_MINUTE, 60_000),
      reportRateLimiter:
        reportRateLimiter ?? new RateLimiter(REPORT_MAX_REQUESTS_PER_MINUTE, 60_000),
      feedRateLimiter: feedRateLimiter ?? new RateLimiter(FEED_MAX_REQUESTS_PER_MINUTE, 60_000),
      photoRateLimiter: photoRateLimiter ?? new RateLimiter(PHOTO_MAX_REQUESTS_PER_MINUTE, 60_000),
    }),
  );

  app.notFound((c) => c.json(errors.notFound("Rota não encontrada.").toBody(), 404));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      for (const [name, value] of Object.entries(error.headers)) c.header(name, value);
      return c.json(error.toBody(), error.status as ContentfulStatusCode);
    }
    // Falha de dados ou inesperada: detalhes só no log; o cliente recebe mensagem genérica.
    const isDataError = error instanceof DbError;
    logger.error(
      { err: error, requestId: c.get("requestId"), code: isDataError ? error.code : undefined },
      "erro ao atender a requisição",
    );
    const apiError = isDataError
      ? errors.dataUnavailable()
      : new ApiError(500, "internal_error", "Algo deu errado. Tente de novo em instantes.");
    return c.json(apiError.toBody(), apiError.status as ContentfulStatusCode);
  });

  return app;
}
