import type { Db } from "../../../database/supabase";
import { normalizeName } from "../../../lib/normalize";
import type { SizeUnit } from "../../../lib/units";
import type { ExtractionOutput } from "../../ai/service/provider";
import type { NewObservation, PipelineRepo, SourceRecord, SourceStatus } from "../pipeline.types";
import type { AliasRecord, CatalogProduct } from "../service/match";
import { median } from "../service/validate";

const STORAGE_BUCKET_BY_SOURCE_KIND = {
  flyer: "flyers",
  label: "labels",
  receipt: "labels",
} as const;

function failIfError(operation: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

/** Implementação do pipeline sobre o Supabase com `service_role` (ignora a RLS: só no worker). */
export class SupabasePipelineRepo implements PipelineRepo {
  constructor(private readonly db: Db) {}

  async getSource(sourceId: string): Promise<SourceRecord | null> {
    const { data: sourceRow, error } = await this.db
      .from("sources")
      .select("id, store_id, kind, file_path")
      .eq("id", sourceId)
      .maybeSingle();
    failIfError("getSource", error);
    return sourceRow
      ? {
          id: sourceRow.id,
          storeId: sourceRow.store_id,
          kind: sourceRow.kind,
          filePath: sourceRow.file_path,
        }
      : null;
  }

  async setSourceStatus(
    sourceId: string,
    status: SourceStatus,
    errorMessage?: string,
  ): Promise<void> {
    const updateResult = await this.db
      .from("sources")
      .update({ status, error: errorMessage ?? null })
      .eq("id", sourceId);
    failIfError("setSourceStatus", updateResult.error);
  }

  async download(source: SourceRecord) {
    const { data: fileBlob, error } = await this.db.storage
      .from(STORAGE_BUCKET_BY_SOURCE_KIND[source.kind])
      .download(source.filePath);
    if (error || !fileBlob) throw new Error(`download: ${error?.message ?? "arquivo vazio"}`);
    return { bytes: new Uint8Array(await fileBlob.arrayBuffer()), mimeType: fileBlob.type };
  }

  async saveExtraction({
    sourceId,
    output,
  }: {
    sourceId: string;
    output: ExtractionOutput;
  }): Promise<void> {
    const itemConfidences = output.data.items.map((item) => item.confidence);
    const averageConfidence = itemConfidences.length
      ? itemConfidences.reduce((sum, confidence) => sum + confidence, 0) / itemConfidences.length
      : null;
    const insertResult = await this.db.from("extractions").insert({
      source_id: sourceId,
      model: `${output.model}@${output.promptVersion}`,
      raw_json: JSON.parse(output.rawText) as never,
      confidence: averageConfidence === null ? null : Number(averageConfidence.toFixed(3)),
    });
    failIfError("saveExtraction", insertResult.error);
  }

  async loadCatalog(): Promise<CatalogProduct[]> {
    const { data: productRows, error } = await this.db
      .from("products")
      .select("id, gtin, canonical_name, brand, size_value, size_unit")
      .eq("status", "active");
    failIfError("loadCatalog", error);
    return (productRows ?? []).map((product) => ({
      id: product.id,
      gtin: product.gtin,
      canonicalName: product.canonical_name,
      brand: product.brand,
      sizeValue: Number(product.size_value),
      sizeUnit: product.size_unit as SizeUnit,
    }));
  }

  async loadAliases(): Promise<AliasRecord[]> {
    const { data: aliasRows, error } = await this.db
      .from("product_aliases")
      .select("store_id, normalized_name, product_id, status")
      .eq("status", "approved")
      .not("product_id", "is", null);
    failIfError("loadAliases", error);
    return (aliasRows ?? []).flatMap((aliasRow) =>
      aliasRow.product_id
        ? [
            {
              storeId: aliasRow.store_id,
              normalizedName: aliasRow.normalized_name,
              productId: aliasRow.product_id,
              status: aliasRow.status,
            },
          ]
        : [],
    );
  }

  async medianUnitPriceCents(productId: string, excludeStoreId: string): Promise<number | null> {
    const { data: priceRows, error } = await this.db
      .from("current_prices")
      .select("unit_price_cents")
      .eq("product_id", productId)
      .neq("store_id", excludeStoreId);
    failIfError("medianUnitPriceCents", error);
    return median((priceRows ?? []).map((priceRow) => priceRow.unit_price_cents));
  }

  async hasDuplicate(input: {
    storeId: string;
    productId: string;
    priceCents: number;
    validTo: string | null;
  }): Promise<boolean> {
    let duplicateQuery = this.db
      .from("price_observations")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("product_id", input.productId)
      .eq("price_cents", input.priceCents)
      .in("status", ["approved", "pending"])
      .gte("observed_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    duplicateQuery = input.validTo
      ? duplicateQuery.eq("valid_to", input.validTo)
      : duplicateQuery.is("valid_to", null);
    const { data: duplicateRows, error } = await duplicateQuery.limit(1);
    failIfError("hasDuplicate", error);
    return (duplicateRows ?? []).length > 0;
  }

  async insertObservation(observation: NewObservation): Promise<string> {
    const { data: insertedRow, error } = await this.db
      .from("price_observations")
      .insert({
        store_id: observation.storeId,
        product_id: observation.productId,
        price_cents: observation.priceCents,
        unit_price_cents: 1, // recalculado pelo trigger a partir do tamanho do produto
        promo: observation.promo,
        valid_from: observation.validFrom,
        valid_to: observation.validTo,
        source: "flyer",
        source_id: observation.sourceId,
        confidence: observation.confidence,
        status: observation.status,
      })
      .select("id")
      .single();
    failIfError("insertObservation", error);
    if (!insertedRow) throw new Error("insertObservation: sem retorno");
    return insertedRow.id;
  }

  async upsertPendingAlias(input: {
    storeId: string;
    rawName: string;
    productId: string | null;
    confidence: number;
  }): Promise<string> {
    const normalizedName = normalizeName(input.rawName);
    const existingAlias = await this.db
      .from("product_aliases")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("normalized_name", normalizedName)
      .maybeSingle();
    failIfError("upsertPendingAlias.select", existingAlias.error);
    if (existingAlias.data) return existingAlias.data.id;

    const { data: insertedAlias, error } = await this.db
      .from("product_aliases")
      .insert({
        store_id: input.storeId,
        raw_name: input.rawName,
        normalized_name: normalizedName,
        product_id: input.productId,
        confidence: input.confidence,
        status: "pending",
      })
      .select("id")
      .single();
    failIfError("upsertPendingAlias.insert", error);
    if (!insertedAlias) throw new Error("upsertPendingAlias: sem retorno");
    return insertedAlias.id;
  }

  async createReviewTask(input: {
    targetType: "price_observation" | "product_alias" | "source";
    targetId: string;
    reason: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from("review_tasks").insert({
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason.slice(0, 500),
      payload: (input.payload ?? null) as never,
    });
    // 23505: já existe tarefa aberta para este alvo (índice único parcial): ok, é idempotente
    if (error && error.code !== "23505") failIfError("createReviewTask", error);
  }
}
