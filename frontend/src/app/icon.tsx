import { ImageResponse } from "next/og";

// Ícones PWA gerados no build (192 e 512). Substituir pela identidade visual quando houver nome/logo.
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1f7a4d",
        color: "#fff",
        fontSize: size * 0.55,
        fontWeight: 700,
      }}
    >
      R$
    </div>,
    { width: size, height: size },
  );
}
