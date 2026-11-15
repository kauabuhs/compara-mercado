import type { PgBoss } from "pg-boss";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerEnv } from "../../config/worker-env";

const runPipeline = vi.fn();
const rpc = vi.fn();
const poolEnd = vi.fn(async () => undefined);
const expirePromotions = vi.fn(async () => 3);
const expireStockReservations = vi.fn(async () => 0);

vi.mock("../../database/client", () => ({
  createPool: () => ({ end: poolEnd }),
  createOrmDb: () => ({}),
}));
vi.mock("../../database/supabase", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("../../modules/ingest/repository/pipeline.repository", () => ({
  SupabasePipelineRepo: class {},
}));
vi.mock("../../modules/ingest/service/pipeline.service", () => ({
  runPipeline: (...args: unknown[]) => runPipeline(...args),
}));
vi.mock("../../modules/promotions/repository/promotion.repository", () => ({
  expirePromotions: () => expirePromotions(),
}));
vi.mock("../../modules/stock/repository/stock.repository", () => ({
  expireStockReservations: () => expireStockReservations(),
}));
vi.mock("../job-runs", () => ({
  trackedJob: async (
    _db: unknown,
    _name: string,
    _key: string | null,
    fn: () => Promise<number>,
  ) => ({
    runId: "run",
    value: await fn(),
  }),
}));

const { QUEUES, enqueueProcessSource, registerJobs } = await import("../index");

type Handler = (jobs: Array<{ id: string; data: unknown }>) => Promise<void>;

/** pg-boss falso: guarda handlers, filas e agendas registrados. */
function fakeBoss() {
  const handlers = new Map<string, Handler>();
  const queues: string[] = [];
  const schedules = new Map<string, string>();
  const sent: Array<{ queue: string; data: unknown; options: unknown }> = [];
  const boss = {
    createQueue: async (name: string) => void queues.push(name),
    // `work(name, handler)` ou `work(name, options, handler)`
    work: async (name: string, a: unknown, b?: unknown) =>
      void handlers.set(name, (typeof a === "function" ? a : b) as Handler),
    schedule: async (name: string, cron: string) => void schedules.set(name, cron),
    send: async (queue: string, data: unknown, options?: unknown) => {
      sent.push({ queue, data, options });
      return "job-id";
    },
  };
  return { boss: boss as unknown as PgBoss, handlers, queues, schedules, sent };
}

const env: WorkerEnv = {
  DATABASE_URL: "postgresql://x",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(30),
  AI_PROVIDER: "fake",
  AI_MONTHLY_BUDGET_CENTS: 20_000,
  PUBLISH_CONFIDENCE_THRESHOLD: 0.9,
  LOG_LEVEL: "silent" as WorkerEnv["LOG_LEVEL"],
  PORT: 8080,
};
const log = pino({ level: "silent" });
const SOURCE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
  runPipeline.mockResolvedValue({ published: 0 });
});

describe("registerJobs", () => {
  it("cria as 4 filas e agenda manutenção com as cadências esperadas", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    expect(t.queues.sort()).toEqual(Object.values(QUEUES).sort());
    expect(t.schedules.get(QUEUES.refreshPrices)).toBe("*/10 * * * *");
    expect(t.schedules.get(QUEUES.expirePromotions)).toBe("*/5 * * * *");
    expect(t.schedules.get(QUEUES.expireStockReservations)).toBe("* * * * *");
    // process-source é sob demanda, nunca agendada
    expect(t.schedules.has(QUEUES.processSource)).toBe(false);
    expect([...t.handlers.keys()].sort()).toEqual(Object.values(QUEUES).sort());
  });

  it("close() libera o pool de conexões", async () => {
    const jobs = await registerJobs(fakeBoss().boss, env, log);
    await jobs.close();
    expect(poolEnd).toHaveBeenCalledOnce();
  });

  it("process-source: payload inválido é rejeitado sem chamar o pipeline", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    const handler = t.handlers.get(QUEUES.processSource);
    await expect(handler?.([{ id: "j1", data: { sourceId: "nao-e-uuid" } }])).rejects.toThrow();
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("process-source: lote vazio não faz nada", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    await t.handlers.get(QUEUES.processSource)?.([]);
    expect(runPipeline).not.toHaveBeenCalled();
  });

  it("process-source: com publicação, agenda refresh deduplicado; sem publicação, não", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    const handler = t.handlers.get(QUEUES.processSource);

    runPipeline.mockResolvedValueOnce({ published: 0 });
    await handler?.([{ id: "j1", data: { sourceId: SOURCE } }]);
    expect(t.sent).toHaveLength(0);

    runPipeline.mockResolvedValueOnce({ published: 2 });
    await handler?.([{ id: "j2", data: { sourceId: SOURCE, correlationId: "abc" } }]);
    expect(t.sent).toEqual([
      {
        queue: QUEUES.refreshPrices,
        data: {},
        options: { singletonKey: "refresh", singletonSeconds: 30 },
      },
    ]);
    expect(runPipeline.mock.calls[1]?.[1]).toBe(SOURCE);
  });

  it("process-source: erro do pipeline sobe para o pg-boss reagendar", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    runPipeline.mockRejectedValueOnce(new Error("budget_exceeded"));
    await expect(
      t.handlers.get(QUEUES.processSource)?.([{ id: "j1", data: { sourceId: SOURCE } }]),
    ).rejects.toThrow("budget_exceeded");
  });

  it("refresh-current-prices: chama o RPC e falha alto se o banco recusar", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    const handler = t.handlers.get(QUEUES.refreshPrices);
    await handler?.([]);
    expect(rpc).toHaveBeenCalledWith("refresh_current_prices");

    rpc.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(handler?.([])).rejects.toThrow("refresh_current_prices: boom");
  });

  it("manutenção: executa a regra de promoções e de reservas", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    await t.handlers.get(QUEUES.expirePromotions)?.([{ id: "p1", data: {} }]);
    await t.handlers.get(QUEUES.expireStockReservations)?.([{ id: "s1", data: {} }]);
    expect(expirePromotions).toHaveBeenCalledOnce();
    expect(expireStockReservations).toHaveBeenCalledOnce();
  });

  it("manutenção também roda sem job (chamada manual)", async () => {
    const t = fakeBoss();
    await registerJobs(t.boss, env, log);
    await t.handlers.get(QUEUES.expirePromotions)?.([]);
    expect(expirePromotions).toHaveBeenCalledOnce();
  });
});

describe("enqueueProcessSource", () => {
  it("enfileira com 3 tentativas, backoff e chave única por arquivo", async () => {
    const t = fakeBoss();
    await enqueueProcessSource(t.boss, SOURCE, "corr-1");
    expect(t.sent).toEqual([
      {
        queue: QUEUES.processSource,
        data: { sourceId: SOURCE, correlationId: "corr-1" },
        options: { retryLimit: 3, retryDelay: 60, retryBackoff: true, singletonKey: SOURCE },
      },
    ]);
  });
});
