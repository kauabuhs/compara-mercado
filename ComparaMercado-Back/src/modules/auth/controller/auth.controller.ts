import { Hono } from "hono";
import { apiRoutes } from "../../../contracts";
import { requireUser } from "../../../middlewares/auth";
import type { AppEnv } from "../../../middlewares/context";
import type { Authenticator } from "../auth.types";

/** Dados do usuário logado. O front usa para decidir o que mostrar; a autorização real é aqui. */
export function accountRoutes(authenticator: Authenticator) {
  const routes = new Hono<AppEnv>();
  routes.get(apiRoutes.currentUser, requireUser(authenticator), (c) => c.json(c.get("user")));
  return routes;
}
