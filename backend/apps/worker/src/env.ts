import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AI_PROVIDER: z.enum(["fake", "anthropic"]).default("fake"),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Teto mensal de gasto com IA, em centavos de dólar. */
  AI_MONTHLY_BUDGET_CENTS: z.coerce.number().int().positive().default(20_000),
  PUBLISH_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PORT: z.coerce.number().int().default(8080),
});

export type WorkerEnv = z.infer<typeof schema>;

/** Valida o ambiente na subida: o worker não inicia com configuração incompleta. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Ambiente do worker inválido: ${fields}`);
  }
  if (parsed.data.AI_PROVIDER === "anthropic" && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error("AI_PROVIDER=anthropic exige ANTHROPIC_API_KEY");
  }
  return parsed.data;
}
