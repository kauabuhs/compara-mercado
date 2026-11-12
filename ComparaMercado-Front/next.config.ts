import { join } from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP estática. Endurecimento futuro: nonce por requisição via proxy.ts (ver docs/adr/0003-seguranca-web.md).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "font-src 'self'",
  `connect-src 'self' https://tiles.openfreemap.org${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Remove o botão "N" do Next em desenvolvimento (config oficial; erros continuam no overlay).
  devIndicators: false,
  // O contrato Ã© a Ãºnica fonte fora do diretÃ³rio do front. Limitar a raiz ao monorepo
  // permite que Turbopack acompanhe esse arquivo sem abrir a observaÃ§Ã£o para fora do projeto.
  turbopack: { root: join(import.meta.dirname, "..") },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // O service worker precisa ser revalidado sempre e ter escopo total
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default config;
