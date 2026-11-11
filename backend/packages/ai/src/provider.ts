import type { DocumentMime, FlyerExtraction } from "./schemas";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractionInput {
  bytes: Uint8Array;
  mimeType: DocumentMime;
}

export interface ExtractionOutput {
  data: FlyerExtraction;
  /** JSON bruto devolvido pelo modelo: guardado em `extractions.raw_json` para auditoria. */
  rawText: string;
  model: string;
  promptVersion: string;
  usage: TokenUsage;
}

/** Fronteira do pipeline com qualquer provedor de IA multimodal. */
export interface VisionProvider {
  readonly name: string;
  extractFlyer(input: ExtractionInput): Promise<ExtractionOutput>;
}

export class AiProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, options: { retryable: boolean; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiProviderError";
    this.retryable = options.retryable;
  }
}
