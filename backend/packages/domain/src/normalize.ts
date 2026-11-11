import type { SizeUnit } from "./units";

/** Minúsculas, sem acento, sem pontuação, espaços únicos. Base para busca e casamento. */
export function normalizeName(raw: string): string {
  return (
    raw
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9%.\s]/g, " ")
      // ponto só é mantido entre dígitos (1.5), onde é separador decimal
      .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const UNIT_ALIASES: Record<string, SizeUnit> = {
  g: "g",
  gr: "g",
  grs: "g",
  grama: "g",
  gramas: "g",
  kg: "kg",
  kgs: "kg",
  quilo: "kg",
  quilos: "kg",
  ml: "ml",
  l: "l",
  lt: "l",
  lts: "l",
  litro: "l",
  litros: "l",
  un: "un",
  und: "un",
  unid: "un",
  unidade: "un",
  unidades: "un",
};

export interface ParsedSize {
  value: number;
  unit: SizeUnit;
}

const SIZE_RE =
  /(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(gramas?|grs?|g|kgs?|quilos?|ml|litros?|lts?|l|unidades?|unid|und|un)\b/;

/**
 * Extrai o tamanho de um texto de encarte/etiqueta: "Arroz 5kg", "Leite 1,5 L",
 * "Cerveja 6x350ml" (multipack soma 2100 ml). Devolve null se não achar.
 */
export function parseSize(text: string): ParsedSize | null {
  const sizeMatch = SIZE_RE.exec(normalizeName(text.replace(/(\d),(\d)/g, "$1.$2")));
  if (!sizeMatch) return null;
  const [, multiplier, amount, rawUnit] = sizeMatch;
  const unit = rawUnit ? UNIT_ALIASES[rawUnit] : undefined;
  const value = Number(amount);
  if (!unit || !Number.isFinite(value) || value <= 0) return null;
  const times = multiplier ? Number(multiplier) : 1;
  return { value: Math.round(value * times * 1e6) / 1e6, unit };
}
