import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  /** URL da API do back-end, acessada só pelo servidor do Next (nunca pelo navegador). */
  API_URL: z.url(),
  /** Quantos proxies confiáveis ficam à frente do app (X-Forwarded-For é lido da direita). */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Variáveis validadas na primeira leitura. Falha cedo, com mensagem clara, em vez de um erro
 * obscuro mais adiante. Segredos NÃO passam por aqui: o front só conhece chaves públicas.
 */
export function env(): Env {
  if (cached) return cached;
  const isProduction = process.env["NODE_ENV"] === "production";
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    NEXT_PUBLIC_SITE_URL: process.env["NEXT_PUBLIC_SITE_URL"],
    // Em desenvolvimento a API local é o padrão; em produção a variável é obrigatória.
    API_URL: process.env["API_URL"] ?? (isProduction ? undefined : "http://127.0.0.1:4000"),
    TRUSTED_PROXY_HOPS: process.env["TRUSTED_PROXY_HOPS"],
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes: ${fields}. Copie .env.example para ComparaMercado-Front/.env.local (veja README).`,
    );
  }
  cached = parsed.data;
  return cached;
}
