import { CitySearchQuerySchema } from "@contracts";
import { getClientIp } from "@/server/request";
import { ApiRequestError, ApiUnavailableError } from "@/services/api/client";
import { searchCities } from "@/services/api/endpoints";

/**
 * Busca na biblioteca de cidades para o seletor (digitação com resposta rápida). É um Route
 * Handler, e não uma Server Action, porque a busca roda a cada pausa de digitação: GET pode ser
 * cancelado quando a pessoa continua digitando, e Server Actions são enfileiradas e não cancelam.
 * O navegador fala só com o servidor do Next; a API e o token continuam fora do alcance dele.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = CitySearchQuerySchema.safeParse(params);
  if (!query.success) {
    return Response.json({ message: "Busca inválida." }, { status: 400 });
  }

  try {
    const cities = await searchCities(
      {
        q: query.data.q,
        limit: query.data.limit,
        ...(query.data.uf ? { uf: query.data.uf } : {}),
      },
      await getClientIp(),
    );
    return Response.json({ cities }, { headers: { "cache-control": "private, max-age=30" } });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 429) {
      return Response.json(
        { message: "Muitas buscas seguidas. Tente de novo em instantes." },
        {
          status: 429,
        },
      );
    }
    if (error instanceof ApiRequestError || error instanceof ApiUnavailableError) {
      return Response.json({ message: "Não foi possível buscar agora." }, { status: 503 });
    }
    throw error;
  }
}
