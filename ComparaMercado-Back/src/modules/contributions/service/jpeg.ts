/**
 * Sanitização de JPEG recebido de usuário (regra pura: sem framework, rede ou `node:*`).
 *
 * Por que não decodificar/re-codificar: a API é empacotada em um único `index.js` (sem
 * `node_modules` no runtime) e o projeto evita dependências nativas (ADR-0002). O navegador já
 * comprime e redimensiona a foto (isso também aplica a orientação e descarta o EXIF). Aqui o
 * servidor NÃO confia nisso: percorre a estrutura do arquivo e reescreve só o que importa.
 *
 *  - confere os bytes mágicos e a estrutura de marcadores (arquivo truncado ou lixo é recusado);
 *  - descarta TODOS os metadados (APP0–APP15: EXIF/GPS, XMP, ICC…, e comentários) e qualquer coisa
 *    depois do fim da imagem (carga escondida em arquivo poliglota);
 *  - lê as dimensões do quadro e recusa fotos pequenas demais para ler uma etiqueta ou grandes
 *    demais para serem razoáveis;
 *  - aceita só JPEG de 1 ou 3 componentes, 8 bits (baseline, extended ou progressive).
 *
 * Limite conhecido: a imagem não é decodificada, então um JPEG estruturalmente válido com dados
 * de pixel corrompidos passa. Quem vê o resultado é o revisor (o navegador dele recusa o resto).
 */

export const MIN_SHORT_SIDE_PX = 300;
export const MAX_LONG_SIDE_PX = 8_000;

export type JpegRejection =
  /** Não começa com os bytes de um JPEG. */
  | "not_jpeg"
  /** Estrutura quebrada, truncada ou com marcadores inesperados. */
  | "malformed"
  /** JPEG de um tipo que não aceitamos (lossless, aritmético, CMYK, 12 bits…). */
  | "unsupported"
  | "too_small"
  | "too_large";

export type JpegResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: JpegRejection };

const FF = 0xff;
const MARKER_SOI = 0xd8;
const MARKER_EOI = 0xd9;
const MARKER_SOS = 0xda;
const MARKER_COM = 0xfe;

/** Quadros que não aceitamos: lossless (C3), hierárquicos (C5–C7) e aritméticos (C9–CB, CD–CF). */
const UNSUPPORTED_SOF = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** Quadros aceitos: baseline (C0), extended sequential (C1) e progressive (C2). */
const SUPPORTED_SOF = new Set([0xc0, 0xc1, 0xc2]);
/** Segmentos de estrutura que são copiados como estão: DQT, DHT, DRI e DNL. */
const KEPT_SEGMENTS = new Set([0xdb, 0xc4, 0xdd, 0xdc]);

const isApp = (marker: number) => marker >= 0xe0 && marker <= 0xef;
/** JPG0–JPG13: extensões que ninguém usa; descartadas como metadado. */
const isJpgExtension = (marker: number) => marker >= 0xf0 && marker <= 0xfd;
const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7;

const malformed: JpegResult = { ok: false, reason: "malformed" };

export function sanitizeJpeg(input: Uint8Array): JpegResult {
  if (input.length < 4 || input[0] !== FF || input[1] !== MARKER_SOI || input[2] !== FF) {
    return { ok: false, reason: "not_jpeg" };
  }

  const kept: Uint8Array[] = [Uint8Array.of(FF, MARKER_SOI)];
  let width = 0;
  let height = 0;
  let sawFrame = false;
  let sawScan = false;
  let position = 2;

  while (true) {
    // Marcador: FF seguido de um código (bytes FF extras de preenchimento são permitidos).
    if (input[position] !== FF) return malformed;
    while (input[position + 1] === FF) position++;
    const marker = input[position + 1];
    if (marker === undefined) return malformed;
    position += 2;

    if (marker === MARKER_EOI) {
      if (!sawFrame || !sawScan) return malformed;
      kept.push(Uint8Array.of(FF, MARKER_EOI));
      break; // tudo depois do EOI é descartado
    }
    // SOI repetido, reinício fora de varredura, TEM, 00 e reservados não aparecem aqui.
    if (marker === MARKER_SOI || isRestart(marker) || marker === 0x01 || marker === 0x00) {
      return malformed;
    }

    // Todo o resto é um segmento com tamanho (2 bytes, que contam a si mesmos).
    if (position + 2 > input.length) return malformed;
    const segmentLength = ((input[position] ?? 0) << 8) | (input[position + 1] ?? 0);
    const segmentEnd = position + segmentLength;
    if (segmentLength < 2 || segmentEnd > input.length) return malformed;
    const segmentStart = position - 2; // inclui FF + marcador

    if (isApp(marker) || marker === MARKER_COM || isJpgExtension(marker)) {
      position = segmentEnd; // metadado: não copia
      continue;
    }

    if (UNSUPPORTED_SOF.has(marker)) return { ok: false, reason: "unsupported" };

    if (SUPPORTED_SOF.has(marker)) {
      if (sawFrame || segmentLength < 8) return malformed;
      const precision = input[position + 2];
      height = ((input[position + 3] ?? 0) << 8) | (input[position + 4] ?? 0);
      width = ((input[position + 5] ?? 0) << 8) | (input[position + 6] ?? 0);
      const components = input[position + 7];
      if (precision !== 8) return { ok: false, reason: "unsupported" };
      if (components !== 1 && components !== 3) return { ok: false, reason: "unsupported" };
      if (width === 0 || height === 0) return malformed; // altura definida depois (DNL): recusa
      sawFrame = true;
      kept.push(input.subarray(segmentStart, segmentEnd));
      position = segmentEnd;
      continue;
    }

    if (KEPT_SEGMENTS.has(marker)) {
      kept.push(input.subarray(segmentStart, segmentEnd));
      position = segmentEnd;
      continue;
    }

    if (marker === MARKER_SOS) {
      if (!sawFrame) return malformed;
      // Cabeçalho da varredura + dados comprimidos, até o próximo marcador "de verdade".
      let scanEnd = segmentEnd;
      while (scanEnd < input.length) {
        if (input[scanEnd] !== FF) {
          scanEnd++;
          continue;
        }
        const next = input[scanEnd + 1];
        if (next === undefined) return malformed;
        if (next === 0x00 || isRestart(next)) {
          scanEnd += 2; // FF00 = byte FF literal; RSTn = reinício dentro da varredura
        } else if (next === FF) {
          scanEnd++; // preenchimento
        } else {
          break;
        }
      }
      if (scanEnd >= input.length) return malformed; // sem EOI: arquivo truncado
      kept.push(input.subarray(segmentStart, scanEnd));
      sawScan = true;
      position = scanEnd;
      continue;
    }

    // Qualquer outro marcador (reservado, DAC, DHP, EXP…) não é esperado em foto de câmera.
    return malformed;
  }

  if (Math.min(width, height) < MIN_SHORT_SIDE_PX) return { ok: false, reason: "too_small" };
  if (Math.max(width, height) > MAX_LONG_SIDE_PX) return { ok: false, reason: "too_large" };

  const totalLength = kept.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of kept) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { ok: true, bytes, width, height };
}
