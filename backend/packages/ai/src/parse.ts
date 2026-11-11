import { type FlyerExtraction, FlyerExtractionSchema } from "./schemas";

/** Extrai o objeto JSON de uma resposta, tolerando cercas ```json e texto em volta. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("resposta sem objeto JSON");
  return JSON.parse(text.slice(start, end + 1));
}

export type ParseResult = { ok: true; data: FlyerExtraction } | { ok: false; error: string };

/** Parse + validação Zod. Nunca lança: o chamador decide entre retry e revisão humana. */
export function parseFlyerExtraction(text: string): ParseResult {
  try {
    const parsed = FlyerExtractionSchema.safeParse(extractJsonObject(text));
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return { ok: false, error: `JSON fora do schema: ${issues}` };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "JSON inválido" };
  }
}
