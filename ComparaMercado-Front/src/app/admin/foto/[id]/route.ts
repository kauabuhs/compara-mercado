import { z } from "zod";
import { getAccessToken } from "@/server/session";
import { fetchObservationPhoto } from "@/services/api/endpoints";

export const dynamic = "force-dynamic";

const noBody = (status: number) => new Response(null, { status });

/**
 * Foto da etiqueta de um envio, para a tela de revisão. O navegador só fala com o Next: aqui o
 * token sai do cookie httpOnly e a API (que exige o papel `admin` e confere a RLS do bucket
 * privado) decide. Route handlers não passam pelo layout do /admin, então esta checagem é a da API.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const observationId = z.uuid().safeParse((await context.params).id);
  if (!observationId.success) return noBody(404);

  const accessToken = await getAccessToken();
  if (!accessToken) return noBody(401);

  let upstream: Response;
  try {
    upstream = await fetchObservationPhoto(accessToken, observationId.data);
  } catch {
    return noBody(502);
  }
  if (!upstream.ok || !upstream.body) {
    return noBody([401, 403, 404].includes(upstream.status) ? upstream.status : 502);
  }

  // Dado sensível: sem cache compartilhado, tipo fixo (a API já garante que é JPEG sanitizado).
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
