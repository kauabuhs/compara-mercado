import { Hono } from "hono";
import { apiRoutes, SyncListRequestSchema } from "../../../contracts";
import { requireUser } from "../../../middlewares/auth";
import { type AppEnv, parseJsonBody } from "../../../middlewares/context";
import { errors } from "../../../middlewares/errors";
import type { RateLimiter } from "../../../middlewares/rate-limit";
import type { Authenticator } from "../../auth/auth.types";
import type { MyListServiceFactory } from "../my-list.types";

export interface MyListRoutesDeps {
  authenticator: Authenticator;
  myListFor: MyListServiceFactory;
  /** Limite por usuário: o aparelho sincroniza a cada edição (com atraso), não a cada toque. */
  syncRateLimiter: RateLimiter;
}

/** Lista de compras da conta. Exige login (qualquer papel); cada pessoa só enxerga a sua. */
export function myListRoutes({ authenticator, myListFor, syncRateLimiter }: MyListRoutesDeps) {
  const routes = new Hono<AppEnv>();

  routes.post(apiRoutes.syncMyList, requireUser(authenticator), async (c) => {
    const user = c.get("user");
    const verdict = syncRateLimiter.check(user.id);
    if (!verdict.ok) {
      throw errors.rateLimited(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)));
    }
    const request = await parseJsonBody(c, SyncListRequestSchema);
    const synced = await myListFor(c.get("accessToken")).sync(user.id, request);
    // Dado pessoal: nunca em cache compartilhado.
    c.header("cache-control", "no-store");
    return c.json(synced);
  });

  return routes;
}
