import { randomUUID } from "node:crypto";
import { pino } from "pino";

export type Logger = pino.Logger;

/**
 * Logs estruturados (JSON). Nunca registre dados pessoais, chaves ou o conteúdo bruto dos arquivos.
 * `redact` é a segunda barreira caso alguém logue um objeto de configuração por engano.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "worker" },
    redact: {
      paths: [
        "*.apiKey",
        "*.serviceRoleKey",
        "*.SUPABASE_SERVICE_ROLE_KEY",
        "*.ANTHROPIC_API_KEY",
        "*.DATABASE_URL",
      ],
      censor: "[redacted]",
    },
  });
}

/** Cada job recebe um identificador de correlação, repassado dos pedidos do app quando existir. */
export function jobLogger(base: Logger, jobId: string, correlationId?: string): Logger {
  return base.child({ jobId, correlationId: correlationId ?? randomUUID() });
}
