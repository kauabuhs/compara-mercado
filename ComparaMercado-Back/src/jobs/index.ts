import type { PgBoss } from "pg-boss";
import { z } from "zod";
import type { WorkerEnv } from "../config/worker-env";
import { createOrmDb, createPool } from "../database/client";
import { createServiceClient } from "../database/supabase";
import { jobLogger, type Logger } from "../lib/logger";
import { AnthropicVisionProvider } from "../modules/ai/service/anthropic";
import { BudgetGuard } from "../modules/ai/service/cost";
import { FakeVisionProvider } from "../modules/ai/service/fake";
import type { VisionProvider } from "../modules/ai/service/provider";
import { SupabasePipelineRepo } from "../modules/ingest/repository/pipeline.repository";
import { runPipeline } from "../modules/ingest/service/pipeline.service";
import { expirePromotions } from "../modules/promotions/repository/promotion.repository";
import { expireStockReservations } from "../modules/stock/repository/stock.repository";
import { trackedJob } from "./job-runs";

export const QUEUES = {
  processSource: "process-source",
  refreshPrices: "refresh-current-prices",
  expirePromotions: "expire-promotions",
  expireStockReservations: "expire-stock-reservations",
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

export interface RegisteredJobs {
  /** Libera o pool de conexões diretas. Chamar depois de `boss.stop`. */
  close(): Promise<void>;
}

export async function registerJobs(
  boss: PgBoss,
  env: WorkerEnv,
  log: Logger,
): Promise<RegisteredJobs> {
  const db = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  // Conexão direta (Drizzle) para a manutenção do domínio comercial; pool pequeno e com timeouts.
  const pool = createPool(env.DATABASE_URL, {
    max: 4,
    applicationName: "compara-worker-commerce",
    onError: (err) => log.error({ err }, "erro em conexão ociosa do pool"),
  });
  const commerceDb = createOrmDb(pool);
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

  // ── Manutenção do domínio comercial ───────────────────────────────────────
  // Idempotentes e registrados em job_runs (início, fim, afetados, erro). A vigência de
  // promoções e reservas é checada NA CONSULTA; estes jobs só deixam o status refletir a
  // realidade (relatórios, painéis) e devolvem estoque reservado vencido ao disponível.
  await boss.work(QUEUES.expirePromotions, async ([job]) => {
    const { value } = await trackedJob(
      commerceDb,
      "promotions.expire",
      job ? `pgboss:${job.id}` : null,
      () => expirePromotions(commerceDb),
    );
    if (value > 0) log.info({ expired: value }, "promoções vencidas marcadas como expired");
  });
  await boss.schedule(QUEUES.expirePromotions, "*/5 * * * *");

  await boss.work(QUEUES.expireStockReservations, async ([job]) => {
    const { value } = await trackedJob(
      commerceDb,
      "stock.expire_reservations",
      job ? `pgboss:${job.id}` : null,
      () => expireStockReservations(commerceDb),
    );
    if (value > 0) log.info({ expired: value }, "reservas de estoque vencidas liberadas");
  });
  await boss.schedule(QUEUES.expireStockReservations, "* * * * *");

  log.info(
    { visionProvider: visionProvider.name, queues: Object.values(QUEUES) },
    "jobs registrados",
  );
  return { close: () => pool.end() };
}

/** Enfileira o processamento de um arquivo. Chamado pelo app (service_role) após o upload. */
export async function enqueueProcessSource(boss: PgBoss, sourceId: string, correlationId?: string) {
  return boss.send(
    QUEUES.processSource,
    { sourceId, correlationId },
    { retryLimit: 3, retryDelay: 60, retryBackoff: true, singletonKey: sourceId },
  );
}
