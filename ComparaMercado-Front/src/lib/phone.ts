/**
 * Telefone para exibir. A API guarda em E.164 (`+5554999990000`); na tela, número brasileiro
 * aparece como `(54) 99999-0000`. Qualquer outro formato (ou país) é mostrado como veio.
 */
export function formatPhoneForDisplay(e164: string | null): string {
  if (!e164) return "";
  const brazilian = /^\+55(\d{2})(9?\d{4})(\d{4})$/.exec(e164);
  if (!brazilian) return e164;
  const [, area, first, last] = brazilian;
  return `(${area}) ${first}-${last}`;
}
