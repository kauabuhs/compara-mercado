import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { BudgetGuard } from "../../ai/service/cost";
import { FakeVisionProvider } from "../../ai/service/fake";
import type { FlyerExtraction } from "../../ai/service/schemas";
import type { NewObservation, PipelineRepo, SourceRecord, SourceStatus } from "../pipeline.types";
import type { AliasRecord, CatalogProduct } from "../service/match";
import { runPipeline } from "../service/pipeline.service";

const STORE = "11111111-1111-4111-8111-111111111111";
const catalog: CatalogProduct[] = [
  {
    id: "arroz",
    gtin: "7891000100103",
    canonicalName: "Arroz branco tipo 1",
    brand: "Serra Verde",
    sizeValue: 5,
    sizeUnit: "kg",
  },
  {
    id: "feijao",
    gtin: null,
    canonicalName: "Feijão preto",
    brand: "Campo Bom",
    sizeValue: 1,
    sizeUnit: "kg",
  },
];

/** Repositório em memória: registra tudo o que o pipeline grava. */
class MemoryRepo implements PipelineRepo {
  statuses: SourceStatus[] = [];
  observations: NewObservation[] = [];
  tasks: { targetType: string; reason: string }[] = [];
  aliases: { rawName: string }[] = [];
  extractions = 0;
  median: number | null = null;
  duplicate = false;

  constructor(private readonly source: SourceRecord | null) {}

  async getSource() {
    return this.source;
  }
  async setSourceStatus(_id: string, s: SourceStatus) {
    this.statuses.push(s);
  }
  async download() {
    return { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };
  }
  async saveExtraction() {
    this.extractions++;
  }
  async loadCatalog() {
    return catalog;
  }
  async loadAliases(): Promise<AliasRecord[]> {
    return [];
  }
  async medianUnitPriceCents() {
    return this.median;
  }
  async hasDuplicate() {
    return this.duplicate;
  }
  async insertObservation(o: NewObservation) {
    this.observations.push(o);
    return `obs-${this.observations.length}`;
  }
  async upsertPendingAlias(i: { rawName: string }) {
    this.aliases.push(i);
    return `alias-${this.aliases.length}`;
  }
  async createReviewTask(i: { targetType: string; reason: string }) {
    this.tasks.push(i);
  }
}

const source: SourceRecord = { id: "s1", storeId: STORE, kind: "flyer", filePath: "x.png" };
const log = pino({ level: "silent" });
const NOW = new Date("2026-11-10T12:00:00Z");

function run(repo: MemoryRepo, items: FlyerExtraction["items"], budget = new BudgetGuard(10_000)) {
  return runPipeline(
    {
      repo,
      visionProvider: new FakeVisionProvider({
        storeName: null,
        periodStart: "2026-11-09",
        periodEnd: "2026-11-15",
        items,
      }),
      budget,
      log,
      publishThreshold: 0.9,
      now: () => NOW,
    },
    "s1",
  );
}

const item = (
  over: Partial<FlyerExtraction["items"][number]>,
): FlyerExtraction["items"][number] => ({
  rawName: "Arroz Branco Tipo 1 Serra Verde 5kg",
  brand: null,
  sizeText: "5kg",
  gtin: null,
  priceCents: 2790,
  promo: false,
  validFrom: null,
  validTo: null,
  confidence: 0.97,
  ...over,
});

describe("runPipeline", () => {
  it("publica sozinho com GTIN exato e alta confiança, usando o período do encarte", async () => {
    const repo = new MemoryRepo(source);
    const summary = await run(repo, [item({ gtin: "7891000100103" })]);
    expect(summary).toMatchObject({ items: 1, published: 1, sentToReview: 0, unmatched: 0 });
    expect(repo.observations[0]).toMatchObject({
      productId: "arroz",
      status: "approved",
      validFrom: "2026-11-09T00:00:00-03:00",
      validTo: "2026-11-15T23:59:59-03:00",
    });
    expect(repo.statuses).toEqual(["processing", "extracted"]);
  });

  it("manda para revisão quando a confiança da extração é baixa", async () => {
    const repo = new MemoryRepo(source);
    const summary = await run(repo, [item({ gtin: "7891000100103", confidence: 0.6 })]);
    expect(summary.sentToReview).toBe(1);
    expect(repo.observations[0]?.status).toBe("pending");
    expect(repo.tasks[0]?.targetType).toBe("price_observation");
  });

  it("preço muito acima da mediana vai para revisão mesmo com confiança alta", async () => {
    const repo = new MemoryRepo(source);
    repo.median = 560; // R$ 5,60/kg nos outros mercados; este item custa R$ 27,90 / 5 kg = 5,58 → normal
    expect((await run(repo, [item({ gtin: "7891000100103" })])).published).toBe(1);

    const repo2 = new MemoryRepo(source);
    repo2.median = 200; // mediana bem menor: 5,58 / 2,00 = 2,8x
    expect((await run(repo2, [item({ gtin: "7891000100103" })])).sentToReview).toBe(1);
  });

  it("descarta validade vencida e duplicatas, sem gravar observação", async () => {
    const repo = new MemoryRepo(source);
    const r1 = await run(repo, [item({ gtin: "7891000100103", validTo: "2026-11-01" })]);
    expect(r1.rejected).toBe(1);
    repo.duplicate = true;
    const r2 = await run(repo, [item({ gtin: "7891000100103" })]);
    expect(r2.rejected).toBe(1);
    expect(repo.observations).toHaveLength(0);
  });

  it("produto desconhecido vira alias pendente + tarefa de revisão", async () => {
    const repo = new MemoryRepo(source);
    const summary = await run(repo, [item({ rawName: "Pneu aro 15", sizeText: null })]);
    expect(summary.unmatched).toBe(1);
    expect(repo.aliases).toHaveLength(1);
    expect(repo.tasks[0]?.targetType).toBe("product_alias");
    expect(repo.observations).toHaveLength(0);
  });

  it("tamanho diferente do catálogo não publica sozinho (não compara 1 kg com 5 kg)", async () => {
    const repo = new MemoryRepo(source);
    const summary = await run(repo, [
      item({ rawName: "Arroz Branco Tipo 1 Serra Verde 1kg", sizeText: "1kg" }),
    ]);
    expect(summary.published).toBe(0);
  });

  it("falha sem store_id marca a fonte como failed", async () => {
    const repo = new MemoryRepo({ ...source, storeId: null });
    await expect(run(repo, [])).rejects.toThrow();
    expect(repo.statuses).toEqual(["failed"]);
  });

  it("respeita o teto mensal de IA: não chama o provedor e lança para o pg-boss reagendar", async () => {
    const repo = new MemoryRepo(source);
    const budget = new BudgetGuard(100, 99);
    await expect(run(repo, [item({})], budget)).rejects.toThrow("budget_exceeded");
    expect(repo.extractions).toBe(0);
  });
});
