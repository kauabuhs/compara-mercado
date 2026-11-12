import type { SessionUser } from "../../contracts";

export interface Authenticator {
  /** Valida o token no provedor de identidade. `null` se inválido, expirado ou revogado. */
  authenticate(accessToken: string): Promise<SessionUser | null>;
}
