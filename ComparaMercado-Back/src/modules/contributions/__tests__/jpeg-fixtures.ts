/** Montagem de JPEGs sintéticos (byte a byte) para os testes do módulo de contribuição. */

export const FF = 0xff;

/** Segmento com tamanho: FF <marcador> <tamanho 2 bytes> <payload>. */
export function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [FF, marker, length >> 8, length & 0xff, ...payload];
}

export function sof(options: {
  marker?: number;
  width: number;
  height: number;
  components?: number;
  precision?: number;
}): number[] {
  const { marker = 0xc0, width, height, components = 3, precision = 8 } = options;
  const componentSpecs = Array.from({ length: components }, (_, index) => [index + 1, 0x11, 0]);
  return segment(marker, [
    precision,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    components,
    ...componentSpecs.flat(),
  ]);
}

export const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 16)]);
export const DHT = segment(0xc4, [0x00, ...Array.from({ length: 28 }, (_, index) => index)]);
export const SOS_HEADER = segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
// dados comprimidos com um FF00 (byte literal) e um reinício RST0 no meio
export const SCAN_DATA = [0x12, 0x34, FF, 0x00, 0x56, FF, 0xd0, 0x78];

export interface BuildOptions {
  prefix?: number[]; // segmentos antes do quadro (ex.: EXIF)
  frame?: number[];
  scan?: number[];
  trailer?: number[];
  withEoi?: boolean;
}

export function buildJpeg(options: BuildOptions = {}): Uint8Array {
  const {
    prefix = [],
    frame = sof({ width: 1200, height: 900 }),
    scan = [...SOS_HEADER, ...SCAN_DATA],
    trailer = [],
    withEoi = true,
  } = options;
  return Uint8Array.from([
    FF,
    0xd8,
    ...prefix,
    ...DQT,
    ...frame,
    ...DHT,
    ...scan,
    ...(withEoi ? [FF, 0xd9] : []),
    ...trailer,
  ]);
}

export const text = (value: string) => Array.from(new TextEncoder().encode(value));
export const containsText = (bytes: Uint8Array, value: string) =>
  new TextDecoder("latin1").decode(bytes).includes(value);
