/**
 * Extrai o IP do cliente de `X-Forwarded-For` sem confiar no que o próprio cliente enviou.
 *
 * Proxies que apenas ACRESCENTAM (nginx, ALB…) deixam à esquerda o valor que o cliente mandou,
 * e o IP real fica à direita. Por isso contamos a partir da DIREITA, pulando só os proxies
 * confiáveis (`trustedProxyHops`, padrão 1 = o proxy imediatamente à frente do app).
 * Plataformas que SOBRESCREVEM o header (ex.: Vercel) entregam um único valor, que também funciona.
 */
export function clientIpFromForwardedFor(
  forwardedFor: string | null | undefined,
  trustedProxyHops = 1,
): string {
  const entries = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return "local";
  const hops = Number.isFinite(trustedProxyHops) ? Math.max(1, Math.floor(trustedProxyHops)) : 1;
  return entries[Math.max(0, entries.length - hops)] ?? "local";
}
