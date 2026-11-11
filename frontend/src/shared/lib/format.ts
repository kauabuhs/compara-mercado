const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "até 13/11" para ofertas com validade. */
export function formatValidUntil(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const validUntil = new Date(isoDate);
  return Number.isNaN(validUntil.getTime()) ? null : `até ${shortDateFormatter.format(validUntil)}`;
}

/** 850 -> "850 m"; 1520 -> "1,5 km". */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function formatSize(sizeValue: number, sizeUnit: string): string {
  const formattedValue = Number.isInteger(sizeValue)
    ? String(sizeValue)
    : String(sizeValue).replace(".", ",");
  return `${formattedValue} ${sizeUnit}`;
}
