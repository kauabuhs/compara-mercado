import { DomainError } from "../lib/domain-error";

/** Falha de acesso a dados (Supabase/Postgres). A API a converte em `502 data_unavailable`. */
export class DbError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DbError";
    this.code = code;
  }
}

/**
 * SQLSTATEs próprios levantados pelas funções SQL (ver docs/database/promocoes.md e estoque):
 *   ST001 estoque insuficiente · ST002 reserva não está ativa/expirou
 *   PR001 promoção indisponível · PR002 limite por cliente · PR003 fora do escopo da loja
 * mais os códigos padrão do Postgres que têm significado de negócio aqui.
 */
const CODES: Record<string, { code: string; message: string }> = {
  ST001: { code: "insufficient_stock", message: "Estoque insuficiente." },
  ST002: { code: "reservation_not_active", message: "A reserva não está mais ativa." },
  PR001: { code: "promotion_unavailable", message: "Promoção indisponível." },
  PR002: { code: "promotion_customer_limit", message: "Limite da promoção por cliente atingido." },
  PR003: { code: "promotion_out_of_scope", message: "A promoção não vale nesta loja." },
  "23P01": { code: "price_period_overlap", message: "Já existe um preço neste período." },
  "23505": { code: "duplicate", message: "Registro duplicado." },
  "23503": { code: "invalid_reference", message: "Referência inexistente." },
  "23514": { code: "constraint_violation", message: "Dado fora das regras do banco." },
  "22023": { code: "invalid_argument", message: "Argumento inválido." },
};

/**
 * Procura o SQLSTATE na cadeia de `cause`: o Drizzle embrulha o erro do `pg` em
 * `DrizzleQueryError` ("Failed query: …"), com o erro original em `.cause`.
 */
function findPgCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CODES[code]) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Converte um erro do banco em `DomainError` estável; devolve o original se não for conhecido. */
export function mapDbError(err: unknown): unknown {
  const code = findPgCode(err);
  const known = code ? CODES[code] : undefined;
  if (!known) return err;
  // A mensagem do Postgres é em português e escrita para o operador; fica em `cause`.
  return new DomainError(known.code, known.message, { cause: err });
}

/** Executa `fn` traduzindo erros conhecidos do banco. */
export async function withDbErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw mapDbError(err);
  }
}
