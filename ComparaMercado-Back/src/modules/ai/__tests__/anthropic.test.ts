import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicVisionProvider } from "../service/anthropic";
import { AiProviderError } from "../service/provider";

const valid = {
  storeName: "Mercado Centro",
  periodStart: "2026-11-09",
  periodEnd: "2026-11-15",
  items: [{ rawName: "Arroz Branco 5kg", sizeText: "5kg", priceCents: 2790, confidence: 0.97 }],
};

interface FakeMessage {
  content: Array<{ type: "text"; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
  stop_details?: { category: string | null };
}

function reply(text: string, usage = { input_tokens: 100, output_tokens: 20 }): FakeMessage {
  return { content: [{ type: "text", text }], usage, stop_reason: "end_turn" };
}

type StreamParams = Parameters<Anthropic["messages"]["stream"]>[0];

/** Troca `messages.stream` por uma fila de respostas (ou erros), sem tocar a rede. */
function stubStream(steps: Array<FakeMessage | Error>) {
  const calls: StreamParams[] = [];
  const spy = vi
    .spyOn(Anthropic.Messages.prototype, "stream")
    // O SDK devolve um MessageStream; o provedor só usa `finalMessage()`.
    .mockImplementation(((params: StreamParams) => {
      calls.push(params);
      const step = steps.shift();
      return {
        finalMessage: async () => {
          if (!step) throw new Error("fila de respostas esgotada");
          if (step instanceof Error) throw step;
          return step;
        },
      };
    }) as unknown as typeof Anthropic.Messages.prototype.stream);
  return { calls, spy };
}

const provider = () =>
  new AnthropicVisionProvider({ apiKey: "chave-de-teste", model: "claude-haiku-5-5" });
const png = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" as const };

function firstBlock(params: StreamParams | undefined): { type: string } | undefined {
  const content = params?.messages[0]?.content;
  return Array.isArray(content) ? content[0] : undefined;
}

afterEach(() => vi.restoreAllMocks());

describe("AnthropicVisionProvider", () => {
  it("devolve a extração, o modelo, a versão do prompt e o uso de tokens", async () => {
    stubStream([reply(JSON.stringify(valid))]);
    const out = await provider().extractFlyer(png);
    expect(out.data.items[0]?.priceCents).toBe(2790);
    expect(out.model).toBe("claude-haiku-5-5");
    expect(out.promptVersion).toMatch(/\S/);
    expect(out.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(out.rawText).toContain("Arroz Branco");
  });

  it("imagem vai como bloco `image` e PDF como bloco `document`", async () => {
    const image = stubStream([reply(JSON.stringify(valid))]);
    await provider().extractFlyer(png);
    const imageBlock = firstBlock(image.calls[0]);
    expect(imageBlock?.type).toBe("image");
    vi.restoreAllMocks();

    const pdf = stubStream([reply(JSON.stringify(valid))]);
    await provider().extractFlyer({
      bytes: new Uint8Array([37, 80, 68, 70]),
      mimeType: "application/pdf",
    });
    const docBlock = firstBlock(pdf.calls[0]);
    expect(docBlock?.type).toBe("document");
  });

  it("resposta fora do schema: tenta de novo uma vez, informa o erro e soma os tokens", async () => {
    const { calls } = stubStream([reply("isto não é JSON"), reply(JSON.stringify(valid))]);
    const out = await provider().extractFlyer(png);
    expect(calls).toHaveLength(2);
    expect(out.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
    // A segunda chamada leva a resposta rejeitada e o motivo
    const second = calls[1]?.messages ?? [];
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(second[2])).toContain("rejeitada");
  });

  it("persistindo fora do schema: erro NÃO retentável (vai para revisão humana)", async () => {
    stubStream([reply("lixo"), reply("mais lixo")]);
    const err = await provider()
      .extractFlyer(png)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).retryable).toBe(false);
    expect((err as AiProviderError).message).toContain("fora do schema");
  });

  it("`maxSchemaRetries: 0` não repete a chamada", async () => {
    const { calls } = stubStream([reply("lixo"), reply(JSON.stringify(valid))]);
    const p = new AnthropicVisionProvider({ apiKey: "x", maxSchemaRetries: 0 });
    await expect(p.extractFlyer(png)).rejects.toBeInstanceOf(AiProviderError);
    expect(calls).toHaveLength(1);
  });

  it("recusa do modelo e resposta truncada não são retentáveis", async () => {
    stubStream([{ ...reply(""), stop_reason: "refusal", stop_details: { category: "csam" } }]);
    const refused = await provider()
      .extractFlyer(png)
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AiProviderError);
    expect((refused as AiProviderError).retryable).toBe(false);
    expect((refused as AiProviderError).message).toContain("recusou");
    vi.restoreAllMocks();

    stubStream([{ ...reply("{"), stop_reason: "max_tokens" }]);
    const truncated = await provider()
      .extractFlyer(png)
      .catch((e: unknown) => e);
    expect((truncated as AiProviderError).retryable).toBe(false);
    expect((truncated as AiProviderError).message).toContain("truncada");
  });

  it("429, 5xx e falha de conexão são retentáveis; 400/401 não", async () => {
    const headers = new Headers();
    const cases: Array<[Error, boolean]> = [
      [new Anthropic.RateLimitError(429, {}, "limite", headers), true],
      [new Anthropic.InternalServerError(503, {}, "fora", headers), true],
      [new Anthropic.APIConnectionError({ message: "sem rede" }), true],
      [new Anthropic.BadRequestError(400, {}, "pedido ruim", headers), false],
      [new Anthropic.AuthenticationError(401, {}, "chave inválida", headers), false],
    ];
    for (const [error, retryable] of cases) {
      stubStream([error]);
      const err = await provider()
        .extractFlyer(png)
        .catch((e: unknown) => e);
      expect(err, error.constructor.name).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).retryable, error.constructor.name).toBe(retryable);
      vi.restoreAllMocks();
    }
  });

  it("erro que não é do SDK sobe como está (bug nosso não é mascarado)", async () => {
    stubStream([new TypeError("bug")]);
    await expect(provider().extractFlyer(png)).rejects.toBeInstanceOf(TypeError);
  });

  it("sem modelo informado usa o padrão", async () => {
    stubStream([reply(JSON.stringify(valid))]);
    const out = await new AnthropicVisionProvider({ apiKey: "x", model: "" }).extractFlyer(png);
    expect(out.model).toBe("claude-opus-5-5");
  });
});
