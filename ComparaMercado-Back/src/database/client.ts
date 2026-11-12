/**
 * Conexão direta ao Postgres para caminhos de SERVIDOR CONFIÁVEL (worker, importações, jobs).
 *
 * Esta conexão NÃO passa pela RLS (conecta como o papel da `DATABASE_URL`), por isso:
 *  - nunca use no caminho da API em nome de um usuário (a API usa supabase-js + RLS, ADR-0005);
 *  - `DATABASE_URL` nunca vai ao front (regra R7 do `arch:check`).
 *
 * Pooling: ao usar o pooler do Supabase em modo transação (porta 6543), prepared statements
 * nomeados não funcionam; o `pg` só os usa quando o chamador dá um `name` à consulta, o que o
 * Drizzle não faz — então este cliente é compatível com PgBouncer em modo transação.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type OrmDb = NodePgDatabase<typeof schema>;

export interface PoolOptions {
  /** Conexões máximas deste processo. Some todos os processos: precisa caber no limite do banco. */
  max?: number;
  /** Aborta consultas longas no servidor (ms). */
  statementTimeoutMs?: number;
  /** Mata transações abertas e ociosas, que seguram locks (ms). */
  idleInTransactionTimeoutMs?: number;
  /** Tempo máximo esperando uma conexão livre do pool (ms). */
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  /** Aparece em `pg_stat_activity` e `pg_stat_statements`: identifica quem faz a consulta. */
  applicationName?: string;
  /** Erros de conexões ociosas não podem derrubar o processo. */
  onError?: (err: Error) => void;
}

export function createPool(connectionString: string, options: PoolOptions = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
    idleTimeoutMillis: options.idleTimeoutMs ?? 30_000,
    application_name: options.applicationName ?? "compara-server",
    statement_timeout: options.statementTimeoutMs ?? 30_000,
    idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMs ?? 30_000,
  });
  pool.on("error", options.onError ?? (() => {}));
  return pool;
}

export function createOrmDb(pool: pg.Pool): OrmDb {
  return drizzle(pool, { schema });
}
