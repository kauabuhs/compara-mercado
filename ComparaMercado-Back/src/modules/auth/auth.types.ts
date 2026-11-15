import type { SessionUser } from "../../contracts";

export interface Authenticator {
  /** Valida o token no provedor de identidade. `null` se inválido, expirado ou revogado. */
  authenticate(accessToken: string): Promise<SessionUser | null>;
  /**
   * Esquece o que se sabe sobre esta sessão (cache), para a próxima chamada reler nome e papel.
   * Opcional: só quem memoriza validações precisa implementar.
   */
  forget?(accessToken: string): void;
}
