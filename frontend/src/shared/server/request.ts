import { headers } from "next/headers";

/** IP de origem informado pelo proxy; usado só como chave de rate limit, nunca gravado. */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
