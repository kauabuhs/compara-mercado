import { PAGE_PARAM, parsePage } from "@/lib/pagination";
import { withParams } from "@/lib/search-params";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Parâmetros de URL das listagens do cadastro: `?q=…&situacao=ativos|inativos&pagina=2`. */
export interface ListParams {
  q: string;
  situation: "active" | "inactive" | undefined;
  page: number;
}

const SITUATION_PARAM = "situacao";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseListParams(searchParams: SearchParams): ListParams {
  const situation = first(searchParams[SITUATION_PARAM]);
  return {
    q: first(searchParams["q"]).trim().slice(0, 80),
    situation:
      situation === "ativos" ? "active" : situation === "inativos" ? "inactive" : undefined,
    page: parsePage(searchParams[PAGE_PARAM]),
  };
}

/** Link de uma página da listagem, mantendo a busca e o filtro atuais. */
export function listPageHref(basePath: string, params: ListParams, page: number): string {
  return `${basePath}${withParams("", {
    q: params.q,
    [SITUATION_PARAM]:
      params.situation === "active"
        ? "ativos"
        : params.situation === "inactive"
          ? "inativos"
          : null,
    [PAGE_PARAM]: page === 1 ? null : page,
  })}`;
}
