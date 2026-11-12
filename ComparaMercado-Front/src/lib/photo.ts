/**
 * Preparo da foto da etiqueta no navegador: reduz e re-codifica em JPEG antes do envio.
 * Isso poupa a conexão móvel (uma foto de celular passa de 5 MB) e já descarta EXIF/GPS. A API
 * NÃO confia nisso: ela valida e sanitiza o arquivo de novo (ver `sanitizeJpeg` no back-end).
 */

/** Lado maior da foto enviada: o suficiente para ler a etiqueta sem pesar. */
export const MAX_PHOTO_SIDE_PX = 1600;
/** Igual ao mínimo que a API aceita (`MIN_SHORT_SIDE_PX`): evita enviar o que será recusado. */
export const MIN_PHOTO_SHORT_SIDE_PX = 300;
const PHOTO_QUALITY = 0.82;

/** Falha esperada ao preparar a foto; a mensagem é segura para mostrar ao usuário. */
export class PhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoError";
  }
}

/** Reduz as dimensões para o lado maior caber em `maxSide`, mantendo a proporção. Nunca amplia. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxSide) return { width, height };
  const scale = maxSide / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Lê a imagem (já na orientação correta), reduz e devolve um JPEG novo. Só roda no navegador.
 * Lança `PhotoError` se o arquivo não for uma imagem legível ou for pequena demais.
 */
export async function compressPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoError("Não foi possível abrir essa foto. Tire outra com a câmera do celular.");
  }
  try {
    if (Math.min(bitmap.width, bitmap.height) < MIN_PHOTO_SHORT_SIDE_PX) {
      throw new PhotoError("A foto está pequena demais para ler a etiqueta. Chegue mais perto.");
    }
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_PHOTO_SIDE_PX);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError("Seu navegador não conseguiu preparar a foto.");
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY),
    );
    if (!jpeg) throw new PhotoError("Seu navegador não conseguiu preparar a foto.");
    return jpeg;
  } finally {
    bitmap.close();
  }
}
