import type { ReportReason } from "@contracts";

/** Como cada motivo de denúncia aparece para quem modera (os módulos do front não se importam). */
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  wrong_price: "preço errado",
  wrong_product: "produto errado",
  wrong_store: "mercado errado",
  spam: "spam",
  inappropriate_photo: "foto inadequada",
  other: "outro motivo",
};
