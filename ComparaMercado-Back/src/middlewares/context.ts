import type { Context } from "hono";
import { type ZodType, z } from "zod";
import type { SessionUser } from "../contracts";
import { errors } from "./errors";

/** Variáveis que os middlewares deixam disponíveis para as rotas. */
export type AppEnv = {
  Variables: {
    requestId: string;
    accessToken: string;
    user: SessionUser;
  };
};

export type AppContext = Context<AppEnv>;

/** Valida a query string; falha com 400 sem devolver detalhes internos. */
export function parseQuery<T>(c: AppContext, schema: ZodType<T>): T {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw errors.invalidRequest();
  return parsed.data;
}

export async function parseJsonBody<T>(c: AppContext, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw errors.invalidRequest("O corpo da requisição não é um JSON válido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw errors.invalidRequest();
  return parsed.data;
}

const uuidSchema = z.uuid();

export function parseUuidParam(c: AppContext, name: string): string {
  const parsed = uuidSchema.safeParse(c.req.param(name));
  if (!parsed.success) throw errors.invalidRequest("Identificador inválido.");
  return parsed.data;
}

/**
 * IP do cliente final, repassado pelo servidor Next/proxy em `x-forwarded-for`.
 * Serve só de chave de limite de taxa e nunca é gravado. A API deve ficar atrás desse proxy
 * (rede privada ou firewall): exposta direto à internet, o cabeçalho poderia ser forjado.
 */
export function getClientIp(c: AppContext): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
