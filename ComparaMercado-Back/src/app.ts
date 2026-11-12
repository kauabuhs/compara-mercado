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
import type { Services } from "./services";

const MAX_BODY_BYTES = 64 * 1024;
const COMPARE_MAX_REQUESTS_PER_MINUTE = 30;
const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

export interface AppDependencies {
  services: Services;
  logger: Logger;
  /** Permite ajustar o limite em testes; em produção usa o padrão. */
  compareRateLimiter?: RateLimiter;
}

/** Monta a API. Não abre porta nem lê ambiente: quem sobe o servidor é o `main.ts`. */
export function createApp({ services, logger, compareRateLimiter }: AppDependencies) {
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
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new ApiError(413, "payload_too_large", "Requisição grande demais.");
      },
    }),
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
  app.route("/", accountRoutes(services.authenticator));
  app.route(
    "/",
    adminRoutes({ authenticator: services.authenticator, adminFor: services.adminFor }),
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
