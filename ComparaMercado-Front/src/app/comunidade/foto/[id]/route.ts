import { z } from "zod";
import { getAccessToken } from "@/server/session";
import { fetchCommunityPhoto } from "@/services/api/endpoints";

export const dynamic = "force-dynamic";

const noBody = (status: number) => new Response(null, { status });

/**
 * Foto da etiqueta de uma publicação do feed, só para quem está logado. O navegador só fala com o
 * Next: o token sai do cookie httpOnly e a API (mais a política do bucket privado) decide se a
 * publicação ainda é visível. Pode ficar 5 minutos no cache privado do navegador: é a mesma foto
 * que o feed já mostra, e some do feed por conta própria quando a publicação é contestada.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const observationId = z.uuid().safeParse((await context.params).id);
  if (!observationId.success) return noBody(404);

  const accessToken = await getAccessToken();
  if (!accessToken) return noBody(401);

  let upstream: Response;
  try {
    upstream = await fetchCommunityPhoto(accessToken, observationId.data);
  } catch {
    return noBody(502);
  }
  if (!upstream.ok || !upstream.body) {
    return noBody([401, 403, 404].includes(upstream.status) ? upstream.status : 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}
