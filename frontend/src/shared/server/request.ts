import { headers } from "next/headers";
import { clientIpFromForwardedFor } from "@/shared/lib/client-ip";
import { env } from "./env";

/** IP de origem informado pelo proxy; usado só como chave de rate limit, nunca gravado. */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  return clientIpFromForwardedFor(requestHeaders.get("x-forwarded-for"), env().TRUSTED_PROXY_HOPS);
}
