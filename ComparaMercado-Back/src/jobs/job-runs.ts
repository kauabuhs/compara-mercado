import { sql } from "drizzle-orm";
import type { OrmDb } from "../database/client";

export interface TrackedJobResult<T> {
  runId: string;
  value: T;
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 500);
}

/**
 * Executa um job registrando a execução em `job_runs` (início, fim, afetados, erro).
 *
 *  - `runKey` (ex.: id do job no pg-boss) torna o registro idempotente: reexecutar a mesma
 *    chave reaproveita a linha em vez de duplicá-la;
 *  - falhas são gravadas (status `failed`, mensagem truncada em 500 caracteres, sem payload)
 *    e o erro é relançado para o pg-boss decidir a nova tentativa;
 *  - `fn` devolve quantos registros afetou.
 */
export async function trackedJob(
  db: OrmDb,
  jobName: string,
  runKey: string | null,
  fn: () => Promise<number>,
): Promise<TrackedJobResult<number>> {
  const started = await db.execute<{ id: string }>(
    sql`select public.job_run_start(${jobName}, ${runKey}) as id`,
  );
  const runId = started.rows[0]?.id;
  if (!runId) throw new Error("job_run_start não devolveu id");

  try {
    const affected = await fn();
    await db.execute(
      sql`select public.job_run_finish(${runId}::uuid, 'succeeded'::public.job_run_status, ${affected}::integer, null)`,
    );
    return { runId, value: affected };
  } catch (err) {
    await db
      .execute(
        sql`select public.job_run_finish(${runId}::uuid, 'failed'::public.job_run_status, null, ${errorMessage(err)})`,
      )
      .catch(() => {
        // Se nem o registro da falha for possível, o erro original é o que importa.
      });
    throw err;
  }
}
