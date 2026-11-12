import { randomUUID } from "node:crypto";
import { pino } from "pino";

export type Logger = pino.Logger;
/** Qual processo está logando: aparece em todo registro (`service`). */
export type ServiceName = "api" | "worker";

/**
 * Logs estruturados (JSON). Nunca registre dados pessoais, tokens, chaves nem o conteúdo bruto
 * dos arquivos. `redact` é a segunda barreira caso alguém logue um objeto de configuração,
 * cabeçalhos ou credenciais por engano.
 */
export function createLogger(level: string, service: ServiceName): Logger {
  return pino({
    level,
    base: { service },
    redact: {
      paths: [
        "*.authorization",
        "*.accessToken",
        "*.apiKey",
        "*.serviceRoleKey",
        "*.SUPABASE_ANON_KEY",
        "*.SUPABASE_SERVICE_ROLE_KEY",
        "*.ANTHROPIC_API_KEY",
        "*.DATABASE_URL",
        "headers.authorization",
        "headers.cookie",
      ],
      censor: "[redacted]",
    },
  });
}

/** Cada job recebe um identificador de correlação, repassado dos pedidos do app quando existir. */
export function jobLogger(base: Logger, jobId: string, correlationId?: string): Logger {
  return base.child({ jobId, correlationId: correlationId ?? randomUUID() });
}
