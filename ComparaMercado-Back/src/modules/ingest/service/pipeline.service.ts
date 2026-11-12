import type { Logger } from "../../../lib/logger";
import { normalizeName, parseSize } from "../../../lib/normalize";
import { type SizeUnit, unitPriceCents } from "../../../lib/units";
import { type BudgetGuard, estimateCostUsdCents, PRICING } from "../../ai/service/cost";
import { AiProviderError, type VisionProvider } from "../../ai/service/provider";
import type { ExtractedItem } from "../../ai/service/schemas";
import type { PipelineRepo, PipelineSummary } from "../pipeline.types";
import { matchProduct } from "./match";
import { decidePublication } from "./publish";
import { type Issue, validateObservation } from "./validate";

export interface PipelineDeps {
  repo: PipelineRepo;
  visionProvider: VisionProvider;
  budget: BudgetGuard;
  log: Logger;
  publishThreshold: number;
  now?: () => Date;
}

const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
/** Estimativa conservadora usada só para barrar jobs quando o teto mensal está perto. */
const WORST_CASE_COST_USD_CENTS = 150;

/** Data AAAA-MM-DD -> instante em horário de Brasília (início ou fim do dia). */
function dayToInstant(day: string | null, edge: "start" | "end"): string | null {
  if (!day) return null;
  return `${day}T${edge === "start" ? "00:00:00" : "23:59:59"}-03:00`;
}

function sizeOf(item: ExtractedItem): { sizeValue: number; sizeUnit: SizeUnit } | null {
  const parsed = parseSize(item.sizeText ?? item.rawName);
  return parsed ? { sizeValue: parsed.value, sizeUnit: parsed.unit } : null;
}

/**
 * Passos 2 a 7 do pipeline de coleta para um arquivo já capturado (passo 1 = upload + sha256):
 * extração → normalização → casamento → validação → publicação ou revisão.
 * Idempotente por arquivo: o app só cria um `sources` por sha256.
 */
export async function runPipeline(deps: PipelineDeps, sourceId: string): Promise<PipelineSummary> {
  const { repo, visionProvider, budget, log } = deps;
  const now = deps.now?.() ?? new Date();

  const source = await repo.getSource(sourceId);
  if (!source) throw new Error(`source ${sourceId} não encontrado`);
  if (!source.storeId) {
    await repo.setSourceStatus(sourceId, "failed", "arquivo sem mercado associado");
    throw new Error(`source ${sourceId} sem store_id`);
  }
  const storeId = source.storeId;

  if (!budget.canSpend(WORST_CASE_COST_USD_CENTS)) {
    log.warn({ spent: budget.spent }, "teto mensal de IA atingido: job adiado");
    throw new Error("budget_exceeded"); // o pg-boss reagenda com backoff
  }

  await repo.setSourceStatus(sourceId, "processing");
  const summary: PipelineSummary = {
    sourceId,
    items: 0,
    published: 0,
    sentToReview: 0,
    rejected: 0,
    unmatched: 0,
    costUsdCents: 0,
  };

  try {
    // Extração
    const file = await repo.download(source);
    if (!ACCEPTED_MIME.has(file.mimeType))
      throw new Error(`tipo de arquivo não suportado: ${file.mimeType}`);

    const output = await visionProvider.extractFlyer({
      bytes: file.bytes,
      mimeType: file.mimeType as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
    });
    await repo.saveExtraction({ sourceId, output });

    // Modelos sem tabela de preço (provedor fake, testes) não consomem orçamento
    summary.costUsdCents = PRICING[output.model]
      ? estimateCostUsdCents(output.model, output.usage)
      : 0;
    budget.record(summary.costUsdCents);

    const [catalog, aliases] = await Promise.all([repo.loadCatalog(), repo.loadAliases()]);
    const productById = new Map(
      catalog.map((catalogProduct) => [catalogProduct.id, catalogProduct]),
    );
    summary.items = output.data.items.length;

    for (const item of output.data.items) {
      const size = sizeOf(item);

      // Casamento: GTIN → alias → trigramas
      const match = matchProduct(
        {
          rawName: item.rawName,
          storeId,
          gtin: item.gtin,
          brand: item.brand,
          sizeValue: size?.sizeValue ?? null,
          sizeUnit: size?.sizeUnit ?? null,
        },
        catalog,
        aliases,
      );

      const product = match.productId ? productById.get(match.productId) : undefined;
      if (!product) {
        // Sem produto: vira alias pendente + tarefa de revisão (o humano ensina o casamento)
        const aliasId = await repo.upsertPendingAlias({
          storeId,
          rawName: item.rawName,
          productId: null,
          confidence: 0,
        });
        await repo.createReviewTask({
          targetType: "product_alias",
          targetId: aliasId,
          reason: "produto não identificado",
          payload: {
            rawName: item.rawName,
            priceCents: item.priceCents,
            normalized: normalizeName(item.rawName),
          },
        });
        summary.unmatched++;
        continue;
      }

      // Normalização: preço por unidade base com o tamanho do produto canônico
      const unitCents = unitPriceCents(item.priceCents, product.sizeValue, product.sizeUnit);
      const validFrom = dayToInstant(item.validFrom ?? output.data.periodStart, "start");
      const validTo = dayToInstant(item.validTo ?? output.data.periodEnd, "end");

      // Validação de sanidade
      const [medianCents, duplicate] = await Promise.all([
        repo.medianUnitPriceCents(product.id, storeId),
        repo.hasDuplicate({ storeId, productId: product.id, priceCents: item.priceCents, validTo }),
      ]);
      const issues: Issue[] = validateObservation({
        priceCents: item.priceCents,
        unitPriceCents: unitCents,
        validTo: validTo ? new Date(validTo) : null,
        now,
        medianUnitPriceCents: medianCents,
        isDuplicate: duplicate,
      });

      // Publicação por confiança
      const decision = decidePublication({
        extractionConfidence: item.confidence,
        match,
        issues,
        threshold: deps.publishThreshold,
      });

      if (decision.action === "reject") {
        summary.rejected++;
        log.info({ item: item.rawName, reasons: decision.reasons }, "item descartado");
        continue;
      }

      const obsId = await repo.insertObservation({
        storeId,
        productId: product.id,
        priceCents: item.priceCents,
        promo: item.promo,
        validFrom,
        validTo,
        sourceId,
        confidence: decision.confidence,
        status: decision.action === "publish" ? "approved" : "pending",
      });

      if (decision.action === "publish") {
        summary.published++;
      } else {
        summary.sentToReview++;
        await repo.createReviewTask({
          targetType: "price_observation",
          targetId: obsId,
          reason: decision.reasons.join("; "),
          payload: {
            rawName: item.rawName,
            matchKind: match.kind,
            candidates: match.candidates.slice(0, 3),
          },
        });
      }
    }

    await repo.setSourceStatus(sourceId, "extracted");
    log.info({ ...summary }, "arquivo processado");
    return summary;
  } catch (e) {
    const retryable = e instanceof AiProviderError ? e.retryable : true;
    await repo.setSourceStatus(
      sourceId,
      retryable ? "uploaded" : "failed",
      e instanceof Error ? e.message.slice(0, 500) : "erro",
    );
    throw e;
  }
}
