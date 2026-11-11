import type { MiddlewareHandler } from "hono";
import type { Authenticator } from "../services/types";
import type { AppEnv } from "./context";
import { errors } from "./errors";

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * Exige um token do Supabase Auth no cabeçalho `Authorization: Bearer`. A API não confia no
 * conteúdo do token: ela o valida no Supabase e lê o papel do usuário no banco.
 */
export function requireUser(authenticator: Authenticator): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const accessToken = c.req.header("authorization")?.match(BEARER_PATTERN)?.[1];
    if (!accessToken) throw errors.unauthenticated();

    const user = await authenticator.authenticate(accessToken);
    if (!user) throw errors.invalidToken();

    c.set("accessToken", accessToken);
    c.set("user", user);
    c.header("cache-control", "no-store");
    await next();
  };
}

/** Deve rodar depois de `requireUser`. A RLS do banco continua sendo a segunda barreira. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "admin") throw errors.forbidden();
  await next();
};
