import { createHash } from "node:crypto";
import type { SessionUser } from "../../../contracts";
import type { Authenticator } from "../auth.types";

export interface CachedAuthenticatorOptions {
  /** Por quanto tempo uma validação bem-sucedida vale. Curto de propósito (ver abaixo). */
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 1_000;

interface Entry {
  expiresAt: number;
  user: SessionUser;
}

/**
 * Memoriza por poucos segundos a validação de token, que custa duas idas ao Supabase
 * (`auth.getUser` + leitura de `profiles`) e se repete a cada chamada autenticada — o painel
 * admin faz várias por tela, em paralelo.
 *
 * O custo da troca é explícito: um token revogado, ou um papel alterado, continua valendo aqui
 * por até `ttlMs`. Isso é aceitável porque a RLS do banco é a barreira final e consulta o papel
 * de verdade a cada operação (`is_admin()`); só a decisão de "mostrar a tela" pode atrasar.
 *
 * Só guarda sucesso (um token inválido nunca fica "lembrado") e chamadas simultâneas com o mesmo
 * token compartilham uma única validação. A chave é o hash do token, não o token.
 */
export function withAuthCache(
  inner: Authenticator,
  options: CachedAuthenticatorOptions = {},
): Authenticator {
  const { ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = Date.now } = options;
  const entries = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<SessionUser | null>>();

  return {
    async authenticate(accessToken) {
      const key = createHash("sha256").update(accessToken).digest("hex");

      const cached = entries.get(key);
      if (cached && cached.expiresAt > now()) return cached.user;

      const ongoing = inFlight.get(key);
      if (ongoing) return ongoing;

      const validation = inner
        .authenticate(accessToken)
        .then((user) => {
          if (user) {
            entries.delete(key);
            entries.set(key, { expiresAt: now() + ttlMs, user });
            if (entries.size > maxEntries) {
              const oldestKey = entries.keys().next().value;
              if (oldestKey !== undefined) entries.delete(oldestKey);
            }
          }
          return user;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, validation);
      return validation;
    },
  };
}
