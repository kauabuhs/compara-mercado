import { FLYER_PROMPT_VERSION } from "./prompts";
import type { ExtractionInput, ExtractionOutput, VisionProvider } from "./provider";
import type { FlyerExtraction } from "./schemas";

/**
 * Provedor determinístico para testes e desenvolvimento local: sem rede, sem custo.
 * Devolve a extração configurada, ignorando o arquivo.
 */
export class FakeVisionProvider implements VisionProvider {
  readonly name = "fake";
  readonly calls: ExtractionInput[] = [];

  constructor(private readonly result: FlyerExtraction) {}

  async extractFlyer(input: ExtractionInput): Promise<ExtractionOutput> {
    this.calls.push(input);
    return {
      data: this.result,
      rawText: JSON.stringify(this.result),
      model: "fake-1",
      promptVersion: FLYER_PROMPT_VERSION,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
