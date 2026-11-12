import { z } from "zod";

/** Data no formato YYYY-MM-DD. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");

/** Um item de preço lido de um encarte, etiqueta ou nota. */
export const ExtractedItemSchema = z.object({
  rawName: z.string().min(1).max(200),
  brand: z.string().max(80).nullable().default(null),
  /** Tamanho como aparece no texto: "5kg", "900 ml", "12 un". */
  sizeText: z.string().max(40).nullable().default(null),
  gtin: z
    .string()
    .regex(/^\d{8,14}$/)
    .nullable()
    .default(null),
  /** Preço da embalagem em centavos inteiros (R$ 5,99 = 599). */
  priceCents: z.number().int().positive().max(10_000_000),
  promo: z.boolean().default(false),
  validFrom: isoDate.nullable().default(null),
  validTo: isoDate.nullable().default(null),
  /** Autoavaliação do modelo (0 a 1). Só é um dos sinais da decisão de publicação. */
  confidence: z.number().min(0).max(1),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const FlyerExtractionSchema = z.object({
  storeName: z.string().max(120).nullable().default(null),
  periodStart: isoDate.nullable().default(null),
  periodEnd: isoDate.nullable().default(null),
  items: z.array(ExtractedItemSchema).max(500),
});
export type FlyerExtraction = z.infer<typeof FlyerExtractionSchema>;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type DocumentMime = ImageMime | "application/pdf";
