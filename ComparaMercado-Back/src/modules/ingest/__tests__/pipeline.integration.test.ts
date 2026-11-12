import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "../../../database/supabase";
import { createLogger } from "../../../lib/logger";
import { BudgetGuard } from "../../ai/service/cost";
import { FakeVisionProvider } from "../../ai/service/fake";
import type { FlyerExtraction } from "../../ai/service/schemas";
import { SupabasePipelineRepo } from "../repository/pipeline.repository";
import { runPipeline } from "../service/pipeline.service";

// Pipeline de ponta a ponta contra o Supabase LOCAL (Postgres + Storage reais, provedor de IA
// fake). Os testes unitários usam repositório em memória; aqui valida-se SQL, triggers, índices
// únicos e Storage de verdade. Fica ignorado sem as variáveis:
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_SERVICE_ROLE_KEY=<service_role> pnpm test
// KEEP_QA_DATA=1 mantém os dados criados (para inspecionar a fila de revisão na interface).
const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const keepData = process.env["KEEP_QA_DATA"] === "1";

// PNG 1x1: o provedor fake ignora o conteúdo, mas o pipeline baixa o arquivo e confere o MIME.
const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

// Preços únicos por execução: o detector de duplicata olha observações aprovadas/pendentes dos
// últimos 7 dias (inclusive de outras execuções ou lançadas à mão) e mudaria a classificação.
const jitter = Date.now() % 9;
const LEITE_PRICE = 470 + jitter;
const ARROZ_PRICE = 2490 + jitter;
const FEIJAO_PRICE = 80 + jitter;

function dayFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe.skipIf(!url || !serviceKey)("pipeline contra o Postgres real", () => {
  // describe.skipIf AINDA executa este corpo (só pula os testes): criar o cliente aqui, sem as
  // variáveis, lançaria "supabaseUrl is required" e derrubaria o CI. Por isso é criado no beforeAll.
  let db: ReturnType<typeof createServiceClient>;
  let repo: SupabasePipelineRepo;
  const log = createLogger("fatal", "worker");
  const runId = `qa-${Date.now()}`;
  const sha256 = createHash("sha256").update(randomUUID()).digest("hex");
  const filePath = `${runId}.png`;
  let storeId = "";
  let sourceId = "";

  const extraction: FlyerExtraction = {
    storeName: null,
    periodStart: dayFromNow(-1),
    periodEnd: dayFromNow(5),
    items: [
      // casa com o catálogo e tem confiança alta → publica
      {
        rawName: "Leite Integral Campo Bom 1L",
        brand: "Campo Bom",
        sizeText: "1L",
        gtin: null,
        priceCents: LEITE_PRICE,
        promo: true,
        validFrom: null,
        validTo: null,
        confidence: 0.98,
      },
      // casa, mas a IA não tem certeza → fila de revisão
      {
        rawName: "Arroz Branco Tipo 1 Campo Bom 5kg",
        brand: "Campo Bom",
        sizeText: "5kg",
        gtin: null,
        priceCents: ARROZ_PRICE,
        promo: false,
        validFrom: null,
        validTo: null,
        confidence: 0.6,
      },
      // casa, mas o preço é absurdamente baixo versus os outros mercados → revisão (outlier)
      {
        rawName: "Feijão Preto 1kg",
        brand: null,
        sizeText: "1kg",
        gtin: null,
        priceCents: FEIJAO_PRICE,
        promo: false,
        validFrom: null,
        validTo: null,
        confidence: 0.99,
      },
      // produto que não existe no catálogo → alias pendente + tarefa de revisão
      {
        rawName: `Produto Inexistente ${runId} 3kg`,
        brand: null,
        sizeText: "3kg",
        gtin: null,
        priceCents: 1000,
        promo: false,
        validFrom: null,
        validTo: null,
        confidence: 0.95,
      },
      // oferta já vencida → descartada
      {
        rawName: "Café torrado e moído 500g",
        brand: null,
        sizeText: "500g",
        gtin: null,
        priceCents: 1599,
        promo: true,
        validFrom: null,
        validTo: dayFromNow(-3),
        confidence: 0.99,
      },
    ],
  };

  beforeAll(async () => {
    db = createServiceClient(url ?? "", serviceKey ?? "");
    repo = new SupabasePipelineRepo(db);
    const { data: store } = await db
      .from("stores")
      .select("id")
      .eq("status", "active")
      .limit(1)
      .single();
    storeId = store?.id ?? "";
    expect(storeId).not.toBe("");

    const upload = await db.storage
      .from("flyers")
      .upload(filePath, PNG_1X1, { contentType: "image/png" });
    expect(upload.error).toBeNull();
    const { data: source, error } = await db
      .from("sources")
      .insert({ store_id: storeId, kind: "flyer", file_path: filePath, sha256, status: "uploaded" })
      .select("id")
      .single();
    expect(error).toBeNull();
    sourceId = source?.id ?? "";
  });

  afterAll(async () => {
    if (keepData || !sourceId) return;
    const { data: observations } = await db
      .from("price_observations")
      .select("id")
      .eq("source_id", sourceId);
    const { data: aliases } = await db
      .from("product_aliases")
      .select("id")
      .eq("store_id", storeId)
      .ilike("raw_name", `%${runId}%`);
    const targets = [...(observations ?? []), ...(aliases ?? [])].map((row) => row.id);
    if (targets.length) await db.from("review_tasks").delete().in("target_id", targets);
    // price_observations é somente inclusão (trigger bloqueia DELETE até para service_role):
    // o que dá para fazer é rejeitar. Rejeitada sai da comparação, da fila e do detector de
    // duplicata — por isso o teste continua re-executável. A linha de `sources` fica (FK).
    await db.from("price_observations").update({ status: "rejected" }).eq("source_id", sourceId);
    await db
      .from("product_aliases")
      .delete()
      .eq("store_id", storeId)
      .ilike("raw_name", `%${runId}%`);
    await db.storage.from("flyers").remove([filePath]);
    await db.rpc("refresh_current_prices");
  });

  const deps = (provider = new FakeVisionProvider(extraction)) => ({
    repo,
    visionProvider: provider,
    budget: new BudgetGuard(20_000),
    log,
    publishThreshold: 0.9,
  });

  it("classifica cada item: publica, manda à revisão, descarta e cria alias pendente", async () => {
    const summary = await runPipeline(deps(), sourceId);

    expect(summary.items).toBe(5);
    expect(summary.published).toBe(1);
    expect(summary.sentToReview).toBe(2); // incerteza da IA + outlier de preço
    expect(summary.unmatched).toBe(1);
    expect(summary.rejected).toBe(1); // vencida

    const { data: observations } = await db
      .from("price_observations")
      .select("price_cents, status, source, unit_price_cents, confidence")
      .eq("source_id", sourceId)
      .order("price_cents");
    expect(observations?.map((o) => [o.price_cents, o.status])).toEqual([
      [FEIJAO_PRICE, "pending"],
      [LEITE_PRICE, "approved"],
      [ARROZ_PRICE, "pending"],
    ]);
    // o trigger recalcula o preço por unidade a partir do tamanho do produto (não fica no "1" inserido)
    expect(observations?.every((o) => o.unit_price_cents > 0 && o.source === "flyer")).toBe(true);
    expect(observations?.find((o) => o.price_cents === LEITE_PRICE)?.unit_price_cents).toBe(
      LEITE_PRICE,
    ); // leite de 1 l

    const { data: source } = await db
      .from("sources")
      .select("status, error")
      .eq("id", sourceId)
      .single();
    expect(source).toEqual({ status: "extracted", error: null });
    const { count: extractions } = await db
      .from("extractions")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId);
    expect(extractions).toBe(1);
  });

  it("cria tarefas de revisão para o que precisa de humano, sem duplicar", async () => {
    const { data: observations } = await db
      .from("price_observations")
      .select("id")
      .eq("source_id", sourceId)
      .eq("status", "pending");
    const { data: aliases } = await db
      .from("product_aliases")
      .select("id, status")
      .eq("store_id", storeId)
      .ilike("raw_name", `%${runId}%`);
    expect(aliases).toHaveLength(1);
    expect(aliases?.[0]?.status).toBe("pending");

    const targetIds = [...(observations ?? []), ...(aliases ?? [])].map((row) => row.id);
    const { data: tasks } = await db
      .from("review_tasks")
      .select("target_type, target_id")
      .in("target_id", targetIds);
    expect(tasks).toHaveLength(3); // 2 observações pendentes + 1 alias
    expect(new Set(tasks?.map((task) => task.target_type))).toEqual(
      new Set(["price_observation", "product_alias"]),
    );
  });

  it("é idempotente: reprocessar o mesmo arquivo não cria observações nem tarefas novas", async () => {
    const before = await db
      .from("price_observations")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId);
    const summary = await runPipeline(deps(), sourceId);
    const after = await db
      .from("price_observations")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId);

    expect(summary.published).toBe(0);
    expect(after.count).toBe(before.count);
    const { count: openTasks } = await db
      .from("review_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .in("target_type", ["product_alias"])
      .ilike("reason", "%não identificado%");
    expect(openTasks).toBeGreaterThan(0);
  });

  it("o preço publicado entra em current_prices depois do refresh", async () => {
    const { error } = await db.rpc("refresh_current_prices");
    expect(error).toBeNull();
    const { data } = await db
      .from("current_prices")
      .select("price_cents, promo")
      .eq("store_id", storeId)
      .eq("price_cents", LEITE_PRICE);
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.[0]?.promo).toBe(true);
    // e nada pendente vaza para a comparação pública
    const { data: leaked } = await db
      .from("current_prices")
      .select("price_cents")
      .eq("store_id", storeId)
      .in("price_cents", [FEIJAO_PRICE, ARROZ_PRICE]);
    expect(leaked).toEqual([]);
  });

  it("falha de arquivo ausente volta o source para 'uploaded' (reprocessável) e relança", async () => {
    const { data: orphan } = await db
      .from("sources")
      .insert({
        store_id: storeId,
        kind: "flyer",
        file_path: `${runId}-nao-existe.png`,
        sha256: createHash("sha256").update(randomUUID()).digest("hex"),
        status: "uploaded",
      })
      .select("id")
      .single();
    const orphanId = orphan?.id ?? "";
    try {
      await expect(runPipeline(deps(), orphanId)).rejects.toThrow(/download/);
      const { data: after } = await db
        .from("sources")
        .select("status, error")
        .eq("id", orphanId)
        .single();
      expect(after?.status).toBe("uploaded");
      expect(after?.error).toMatch(/download/);
    } finally {
      await db.from("sources").delete().eq("id", orphanId);
    }
  });

  it("source inexistente falha sem criar nada", async () => {
    await expect(runPipeline(deps(), "00000000-0000-4000-8000-00000000dead")).rejects.toThrow(
      /não encontrado/,
    );
  });
});
