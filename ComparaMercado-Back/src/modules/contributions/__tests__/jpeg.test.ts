import { describe, expect, it } from "vitest";
import { MAX_LONG_SIDE_PX, MIN_SHORT_SIDE_PX, sanitizeJpeg } from "../service/jpeg";

import {
  buildJpeg,
  containsText,
  DHT,
  DQT,
  FF,
  SCAN_DATA,
  SOS_HEADER,
  segment,
  sof,
  text,
} from "./jpeg-fixtures";

describe("sanitizeJpeg — aceita foto válida", () => {
  it("devolve as dimensões e mantém a estrutura da imagem", () => {
    const result = sanitizeJpeg(buildJpeg());
    expect(result).toMatchObject({ ok: true, width: 1200, height: 900 });
    if (!result.ok) return;
    expect([...result.bytes.subarray(0, 2)]).toEqual([FF, 0xd8]);
    expect([...result.bytes.subarray(-2)]).toEqual([FF, 0xd9]);
    // os dados comprimidos (com FF00 e RST0) passam intactos
    expect(containsText(result.bytes, String.fromCharCode(...SCAN_DATA))).toBe(true);
  });

  it("aceita JPEG progressivo com várias varreduras", () => {
    const progressive = buildJpeg({
      frame: sof({ marker: 0xc2, width: 800, height: 600 }),
      scan: [...SOS_HEADER, ...SCAN_DATA, ...DHT, ...SOS_HEADER, ...SCAN_DATA],
    });
    expect(sanitizeJpeg(progressive)).toMatchObject({ ok: true, width: 800, height: 600 });
  });

  it("aceita foto em tons de cinza (1 componente)", () => {
    const gray = buildJpeg({ frame: sof({ width: 640, height: 480, components: 1 }) });
    expect(sanitizeJpeg(gray)).toMatchObject({ ok: true });
  });

  it("aceita bytes FF de preenchimento entre marcadores", () => {
    const padded = buildJpeg({ prefix: [FF, FF, ...segment(0xfe, text("x"))] });
    expect(sanitizeJpeg(padded)).toMatchObject({ ok: true });
  });
});

describe("sanitizeJpeg — remove metadados e carga escondida", () => {
  it("descarta EXIF/GPS (APP1), XMP, ICC e comentários", () => {
    const exif = segment(0xe1, [...text("Exif\0\0"), ...text("GPSLatitude=-29.17;Make=Aparelho")]);
    const xmp = segment(0xe1, text("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>usuario</x:xmpmeta>"));
    const icc = segment(0xe2, text("ICC_PROFILE\0perfil"));
    const jfif = segment(0xe0, text("JFIF\0\x01\x01"));
    const comment = segment(0xfe, text("tirada na casa da Maria"));
    const input = buildJpeg({ prefix: [...jfif, ...exif, ...xmp, ...icc, ...comment] });
    expect(containsText(input, "GPSLatitude")).toBe(true); // a fixture realmente tem metadado

    const result = sanitizeJpeg(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const secret of ["GPSLatitude", "Make=", "xmpmeta", "ICC_PROFILE", "Maria", "JFIF"]) {
      expect(containsText(result.bytes, secret)).toBe(false);
    }
    expect(result.bytes.length).toBeLessThan(input.length);
  });

  it("descarta tudo que vem depois do fim da imagem (arquivo poliglota)", () => {
    const payload = text("<?php system($_GET['c']); ?>PK\x03\x04");
    const result = sanitizeJpeg(buildJpeg({ trailer: payload }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(containsText(result.bytes, "system(")).toBe(false);
    expect([...result.bytes.subarray(-2)]).toEqual([FF, 0xd9]);
  });

  it("é idempotente: sanitizar de novo não muda nada (mesmo sha256 em reenvios)", () => {
    const first = sanitizeJpeg(buildJpeg({ prefix: segment(0xe1, text("Exif\0\0lixo")) }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = sanitizeJpeg(first.bytes);
    expect(second.ok && [...second.bytes]).toEqual([...first.bytes]);
  });
});

describe("sanitizeJpeg — recusa o que não é uma foto utilizável", () => {
  it("recusa arquivos que não são JPEG", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sanitizeJpeg(png)).toEqual({ ok: false, reason: "not_jpeg" });
    expect(sanitizeJpeg(new Uint8Array())).toEqual({ ok: false, reason: "not_jpeg" });
    expect(sanitizeJpeg(Uint8Array.from(text("<html></html>")))).toEqual({
      ok: false,
      reason: "not_jpeg",
    });
    expect(sanitizeJpeg(Uint8Array.from([FF, 0xd8]))).toEqual({ ok: false, reason: "not_jpeg" });
  });

  it("recusa JPEG truncado ou sem fim", () => {
    const whole = buildJpeg();
    expect(sanitizeJpeg(whole.subarray(0, whole.length - 2))).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(sanitizeJpeg(whole.subarray(0, 40))).toEqual({ ok: false, reason: "malformed" });
    expect(sanitizeJpeg(buildJpeg({ withEoi: false }))).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("recusa segmento que declara tamanho maior que o arquivo", () => {
    const lying = Uint8Array.from([FF, 0xd8, FF, 0xdb, 0xff, 0xff, 0, 0, 0, 0]);
    expect(sanitizeJpeg(lying)).toEqual({ ok: false, reason: "malformed" });
  });

  it("recusa varredura antes do quadro e arquivo sem quadro", () => {
    const scanFirst = Uint8Array.from([FF, 0xd8, ...DQT, ...SOS_HEADER, ...SCAN_DATA, FF, 0xd9]);
    expect(sanitizeJpeg(scanFirst)).toEqual({ ok: false, reason: "malformed" });
    expect(sanitizeJpeg(Uint8Array.from([FF, 0xd8, ...DQT, FF, 0xd9]))).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("recusa marcador inesperado e quadro duplicado", () => {
    expect(sanitizeJpeg(buildJpeg({ prefix: segment(0x02, [1, 2, 3]) }))).toEqual({
      ok: false,
      reason: "malformed",
    });
    const doubled = buildJpeg({
      frame: [...sof({ width: 900, height: 900 }), ...sof({ width: 900, height: 900 })],
    });
    expect(sanitizeJpeg(doubled)).toEqual({ ok: false, reason: "malformed" });
  });

  it("recusa tipos de JPEG que não aceitamos (lossless, aritmético, CMYK, 12 bits)", () => {
    const unsupported = { ok: false, reason: "unsupported" };
    expect(
      sanitizeJpeg(buildJpeg({ frame: sof({ marker: 0xc3, width: 900, height: 900 }) })),
    ).toEqual(unsupported);
    expect(
      sanitizeJpeg(buildJpeg({ frame: sof({ marker: 0xc9, width: 900, height: 900 }) })),
    ).toEqual(unsupported);
    expect(
      sanitizeJpeg(buildJpeg({ frame: sof({ width: 900, height: 900, components: 4 }) })),
    ).toEqual(unsupported);
    expect(
      sanitizeJpeg(buildJpeg({ frame: sof({ width: 900, height: 900, precision: 12 }) })),
    ).toEqual(unsupported);
  });

  it("recusa foto pequena demais para ler uma etiqueta", () => {
    const small = buildJpeg({ frame: sof({ width: 1200, height: MIN_SHORT_SIDE_PX - 1 }) });
    expect(sanitizeJpeg(small)).toEqual({ ok: false, reason: "too_small" });
    const edge = buildJpeg({ frame: sof({ width: 1200, height: MIN_SHORT_SIDE_PX }) });
    expect(sanitizeJpeg(edge).ok).toBe(true);
  });

  it("recusa dimensões absurdas e altura zero", () => {
    const huge = buildJpeg({ frame: sof({ width: MAX_LONG_SIDE_PX + 1, height: 900 }) });
    expect(sanitizeJpeg(huge)).toEqual({ ok: false, reason: "too_large" });
    expect(sanitizeJpeg(buildJpeg({ frame: sof({ width: 900, height: 0 }) }))).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
