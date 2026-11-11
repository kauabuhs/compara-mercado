import { z } from "zod";

const schema = z.object({
  /** URL do projeto Supabase (a API fala com o Postgres só por aqui, sempre sob RLS). */
  SUPABASE_URL: z.url(),
  /** Chave pública (anon). A API não usa `service_role`: administra com o token do próprio usuário. */
  SUPABASE_ANON_KEY: z.string().min(20),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /** Em container use 0.0.0.0; localmente o padrão evita expor a API na rede. */
  API_HOST: z.string().min(1).default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type ApiEnv = z.infer<typeof schema>;

/** Valida o ambiente na subida: a API não inicia com configuração incompleta. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Ambiente da API inválido: ${fields}`);
  }
  return parsed.data;
}
