import Anthropic from "@anthropic-ai/sdk";
import { parseFlyerExtraction } from "./parse";
import { FLYER_PROMPT_VERSION, FLYER_SYSTEM_PROMPT, FLYER_USER_PROMPT } from "./prompts";
import {
  AiProviderError,
  type ExtractionInput,
  type ExtractionOutput,
  type VisionProvider,
} from "./provider";

export interface AnthropicProviderOptions {
  apiKey?: string;
  /** Modelo de extração. Decisão em aberto no plano (custo x precisão): meça no golden set. */
  model?: string;
  maxOutputTokens?: number;
  /** Tentativas de correção quando a resposta não bate com o schema. */
  maxSchemaRetries?: number;
}

export const DEFAULT_EXTRACTION_MODEL = "claude-opus-5-5";

/**
 * Adaptador do Claude (visão). A saída é validada com Zod: se vier fora do schema, uma segunda
 * chamada informa o erro ao modelo; persistindo, lança erro e o item segue para revisão humana.
 */
export class AnthropicVisionProvider implements VisionProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly maxSchemaRetries: number;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.model = options.model || DEFAULT_EXTRACTION_MODEL;
    this.maxOutputTokens = options.maxOutputTokens ?? 16_000;
    this.maxSchemaRetries = options.maxSchemaRetries ?? 1;
  }

  async extractFlyer(input: ExtractionInput): Promise<ExtractionOutput> {
    const base64Data = Buffer.from(input.bytes).toString("base64");
    const fileBlock: Anthropic.ContentBlockParam =
      input.mimeType === "application/pdf"
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64Data },
          }
        : {
            type: "image",
            source: { type: "base64", media_type: input.mimeType, data: base64Data },
          };

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: [fileBlock, { type: "text", text: FLYER_USER_PROMPT }] },
    ];

    let inputTokens = 0;
    let outputTokens = 0;
    let lastError = "";

    for (let attempt = 0; attempt <= this.maxSchemaRetries; attempt++) {
      const text = await this.call(messages, (usage) => {
        inputTokens += usage.input_tokens;
        outputTokens += usage.output_tokens;
      });

      const parsed = parseFlyerExtraction(text);
      if (parsed.ok) {
        return {
          data: parsed.data,
          rawText: text,
          model: this.model,
          promptVersion: FLYER_PROMPT_VERSION,
          usage: { inputTokens, outputTokens },
        };
      }

      lastError = parsed.error;
      messages.push(
        { role: "assistant", content: text },
        {
          role: "user",
          content: `Sua resposta foi rejeitada: ${parsed.error}. Responda de novo apenas com o JSON válido.`,
        },
      );
    }

    throw new AiProviderError(`extração fora do schema após retentativas: ${lastError}`, {
      retryable: false,
    });
  }

  private async call(
    messages: Anthropic.MessageParam[],
    onUsage: (u: { input_tokens: number; output_tokens: number }) => void,
  ): Promise<string> {
    try {
      // Streaming: max_tokens alto + documentos grandes podem passar do timeout HTTP.
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxOutputTokens,
        system: [
          // Prompt estável e longo primeiro: elegível a cache entre arquivos do mesmo lote.
          { type: "text", text: FLYER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        messages,
      });
      const message = await stream.finalMessage();
      onUsage(message.usage);

      if (message.stop_reason === "refusal") {
        throw new AiProviderError(
          `o modelo recusou o arquivo (${message.stop_details?.category ?? "sem categoria"})`,
          { retryable: false },
        );
      }
      if (message.stop_reason === "max_tokens") {
        throw new AiProviderError("resposta truncada (max_tokens): encarte grande demais", {
          retryable: false,
        });
      }

      return message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((textBlock) => textBlock.text)
        .join("");
    } catch (e) {
      if (e instanceof AiProviderError) throw e;
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
        throw new AiProviderError("provedor indisponível ou com limite de taxa", {
          retryable: true,
          cause: e,
        });
      }
      if (e instanceof Anthropic.APIConnectionError) {
        throw new AiProviderError("falha de conexão com o provedor", { retryable: true, cause: e });
      }
      if (e instanceof Anthropic.APIError) {
        throw new AiProviderError(`erro do provedor (${e.status ?? "?"}): ${e.message}`, {
          retryable: false,
          cause: e,
        });
      }
      throw e;
    }
  }
}
