import {
  AnthropicVisionProvider,
  BudgetGuard,
  FakeVisionProvider,
  type VisionProvider,
} from "@compara/ai";
import { createServiceClient } from "@compara/db";
import type { PgBoss } from "pg-boss";
import { z } from "zod";
import type { WorkerEnv } from "./env";
import { jobLogger, type Logger } from "./logger";
import { runPipeline } from "./pipeline/run";
import { SupabasePipelineRepo } from "./pipeline/supabase-repo";

export const QUEUES = {
  processSource: "process-source",
  refreshPrices: "refresh-current-prices",
} as const;

const ProcessSourcePayload = z.object({
  sourceId: z.uuid(),
  correlationId: z.string().max(64).optional(),
});

function buildProvider(env: WorkerEnv): VisionProvider {
  if (env.AI_PROVIDER === "anthropic") {
    return new AnthropicVisionProvider({
      apiKey: env.ANTHROPIC_API_KEY ?? "",
      model: env.AI_MODEL ?? "",
    });
  }
  // Provedor fake: não lê o arquivo; útil para desenvolver o resto do fluxo sem custo
  return new FakeVisionProvider({ storeName: null, periodStart: null, periodEnd: null, items: [] });
}

export async function registerJobs(boss: PgBoss, env: WorkerEnv, log: Logger): Promise<void> {
  const db = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const repo = new SupabasePipelineRepo(db);
  const visionProvider = buildProvider(env);
  // O gasto acumulado do mês deve vir do banco em produção; aqui começa do zero a cada subida.
  // TODO(fase-2): persistir o gasto (tabela ai_usage) para sobreviver a reinícios.
  const budget = new BudgetGuard(env.AI_MONTHLY_BUDGET_CENTS);

  for (const name of Object.values(QUEUES)) await boss.createQueue(name);

  // ── Processar um arquivo (encarte/etiqueta) ────────────────────────────────
  await boss.work(QUEUES.processSource, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    const payload = ProcessSourcePayload.parse(job.data);
    const jlog = jobLogger(log, job.id, payload.correlationId);
    const summary = await runPipeline(
      {
        repo,
        visionProvider,
        budget,
        log: jlog,
        publishThreshold: env.PUBLISH_CONFIDENCE_THRESHOLD,
      },
      payload.sourceId,
    );
    if (summary.published > 0) {
      await boss.send(QUEUES.refreshPrices, {}, { singletonKey: "refresh", singletonSeconds: 30 });
    }
    if (budget.nearLimit())
      jlog.warn({ spent: budget.spent }, "gasto de IA acima de 80% do teto mensal");
  });

  // ── Atualizar current_prices (materializada) ──────────────────────────────
  await boss.work(QUEUES.refreshPrices, async () => {
    const { error } = await db.rpc("refresh_current_prices");
    if (error) throw new Error(`refresh_current_prices: ${error.message}`);
    log.info("current_prices atualizada");
  });
  // A cada 10 min: também faz promoções vencidas saírem da comparação
  await boss.schedule(QUEUES.refreshPrices, "*/10 * * * *");

  log.info(
    { visionProvider: visionProvider.name, queues: Object.values(QUEUES) },
    "jobs registrados",
  );
}

/** Enfileira o processamento de um arquivo. Chamado pelo app (service_role) após o upload. */
export async function enqueueProcessSource(boss: PgBoss, sourceId: string, correlationId?: string) {
  return boss.send(
    QUEUES.processSource,
    { sourceId, correlationId },
    { retryLimit: 3, retryDelay: 60, retryBackoff: true, singletonKey: sourceId },
  );
}
