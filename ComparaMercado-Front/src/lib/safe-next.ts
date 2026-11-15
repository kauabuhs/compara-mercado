/**
 * Destino depois de entrar (`?next=`). Vem da URL, então nunca é confiável: só aceitamos um
 * caminho interno de uma lista fixa, nunca um endereço completo (open redirect). Qualquer coisa
 * fora disso cai no destino padrão.
 */
export const DEFAULT_NEXT_PATH = "/conta";

const EXACT_PATHS = new Set([
  "/",
  "/conta",
  "/conta/perfil",
  "/conta/envios",
  "/conta/reputacao",
  "/comunidade",
  "/contribuir",
  "/lista",
  "/mercados",
  "/ofertas",
  "/nova-senha",
]);
const PREFIXES = ["/admin/"];

export function safeNextPath(candidate: unknown, fallback: string = DEFAULT_NEXT_PATH): string {
  if (typeof candidate !== "string") return fallback;
  // Só a parte do caminho conta: query e fragmento são descartados.
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  // Caracteres de controle (quebra de linha, tab) servem para burlar filtros de redirecionamento.
  if ([...candidate].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) {
    return fallback;
  }

  const path = candidate.split(/[?#]/, 1)[0] ?? "";
  if (path === "/admin" || EXACT_PATHS.has(path)) return path;
  if (PREFIXES.some((prefix) => path.startsWith(prefix) && !path.includes(".."))) return path;
  return fallback;
}
