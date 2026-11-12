import type { ExtractionOutput } from "../ai/service/provider";
import type { AliasRecord, CatalogProduct } from "./service/match";

export interface SourceRecord {
  id: string;
  storeId: string | null;
  kind: "flyer" | "label" | "receipt";
  filePath: string;
}

export type SourceStatus = "uploaded" | "processing" | "extracted" | "failed" | "reviewed";

export interface NewObservation {
  storeId: string;
  productId: string;
  priceCents: number;
  promo: boolean;
  validFrom: string | null;
  validTo: string | null;
  sourceId: string;
  confidence: number;
  status: "approved" | "pending";
}

/** Portas do pipeline: o domínio não conhece Supabase, Storage nem rede. */
export interface PipelineRepo {
  getSource(id: string): Promise<SourceRecord | null>;
  setSourceStatus(id: string, status: SourceStatus, error?: string): Promise<void>;
  download(source: SourceRecord): Promise<{ bytes: Uint8Array; mimeType: string }>;
  saveExtraction(input: { sourceId: string; output: ExtractionOutput }): Promise<void>;
  loadCatalog(): Promise<CatalogProduct[]>;
  loadAliases(): Promise<AliasRecord[]>;
  /** Mediana do preço por unidade base do produto nos OUTROS mercados. */
  medianUnitPriceCents(productId: string, excludeStoreId: string): Promise<number | null>;
  hasDuplicate(input: {
    storeId: string;
    productId: string;
    priceCents: number;
    validTo: string | null;
  }): Promise<boolean>;
  insertObservation(obs: NewObservation): Promise<string>;
  upsertPendingAlias(input: {
    storeId: string;
    rawName: string;
    productId: string | null;
    confidence: number;
  }): Promise<string>;
  createReviewTask(input: {
    targetType: "price_observation" | "product_alias" | "source";
    targetId: string;
    reason: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
}

export interface PipelineSummary {
  sourceId: string;
  items: number;
  published: number;
  sentToReview: number;
  rejected: number;
  unmatched: number;
  costUsdCents: number;
}
