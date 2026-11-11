import { pino } from "pino";

export type Logger = pino.Logger;

/**
 * Logs estruturados (JSON). Nunca registre dados pessoais, tokens ou chaves.
 * `redact` é a segunda barreira caso alguém logue um objeto de configuração ou cabeçalhos por engano.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "api" },
    redact: {
      paths: [
        "*.authorization",
        "*.accessToken",
        "*.apiKey",
        "*.SUPABASE_ANON_KEY",
        "headers.authorization",
        "headers.cookie",
      ],
      censor: "[redacted]",
    },
  });
}
