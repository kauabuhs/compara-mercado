# API e contratos

A API HTTP do back-end (`backend/apps/api`) é a **fronteira oficial** entre o front-end e os dados. O contrato vive em [`shared/contracts`](../shared/contracts/src/index.ts): rotas (`apiRoutes`), schemas Zod e tipos. O back-end valida o que recebe; o front-end valida o que lê. Versão atual: `CONTRACT_VERSION = "2.0.0"`. Racional em [ADR-0005](adr/0005-separacao-frontend-backend.md).

## Quem fala com quem

| Fronteira                 | Meio                                           | Autenticação                               |
| ------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Navegador → servidor Next | páginas, Server Actions                        | cookie `httpOnly` do Supabase Auth         |
| Servidor Next → API       | HTTP/JSON, schemas de `shared/contracts`       | `Authorization: Bearer <token do usuário>` |
| API → Postgres            | PostgREST/RPC, chave `anon` + token do usuário | RLS avalia a identidade do usuário         |
| Worker → Postgres         | `service_role` (ignora RLS)                    | chave só no ambiente do worker             |
| Fila                      | pg-boss (tabelas no Postgres)                  | acesso só pelo worker                      |

O navegador não conhece a URL da API nem o token. A proteção de rota no front (`/admin`) é conveniência de interface: **a autorização real é da API** (papel `admin`) e, por baixo, da RLS.

## Endpoints (v1)

| Método e rota                            | Acesso  | Entrada                                  | Saída                      | Observações                                                                                                               |
| ---------------------------------------- | ------- | ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /healthz`                           | público | —                                        | `{ status: "ok" }`         | sonda de saúde                                                                                                            |
| `GET /v1/products/search`                | público | `q` (2–80), `limit` (1–50, padrão 30)    | `{ hits: ProductHit[] }`   | tolera erro de digitação (word_similarity ≥ 0,5) e acento; cache 60 s                                                     |
| `GET /v1/products/:productId`            | público | uuid                                     | `ProductDetails`           | preços com `ageDays` e `freshness`; 404 se não existe; cache 60 s                                                         |
| `GET /v1/offers`                         | público | `storeId?`, `limit` (1–100, padrão 60)   | `{ offers: PriceOffer[] }` | só promoções vigentes; cache 60 s                                                                                         |
| `GET /v1/stores`                         | público | `cityId?`                                | `{ stores: Store[] }`      | cache 5 min                                                                                                               |
| `POST /v1/shopping-lists/compare`        | público | `CompareListRequest`                     | `ListComparison`           | **30 req/min por IP** (429 + `Retry-After`); a localização nunca é gravada                                                |
| `GET /v1/me`                             | token   | —                                        | `SessionUser`              | papel lido do banco; `Cache-Control: no-store`                                                                            |
| `GET /v1/admin/overview`                 | admin   | —                                        | `AdminOverview`            |                                                                                                                           |
| `GET /v1/admin/price-form-options`       | admin   | —                                        | `PriceFormOptions`         |                                                                                                                           |
| `GET /v1/admin/review-queue`             | admin   | —                                        | `{ observations }`         | até 50 pendentes                                                                                                          |
| `POST /v1/admin/prices`                  | admin   | `ManualPriceRequest` (centavos)          | `201 { ok: true }`         | grava `source=manual`, `approved`, atualiza `current_prices`                                                              |
| `POST /v1/admin/observations/:id/review` | admin   | `{ decision: "approved" \| "rejected" }` | `{ ok: true }`             | só observações `pending`; `404` se não existe ou já foi decidida; registra `reviewed_by/at` e resolve a tarefa de revisão |

Regras gerais: valores monetários em **centavos inteiros**; datas ISO 8601; ids UUID; corpo máximo 64 KB; sem CORS habilitado (a API é consumida pelo servidor do Next, não pelo navegador).

## Erros

Formato único (`ApiErrorBody`), com `message` seguro para exibir:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Requisição inválida. Confira os dados enviados."
  }
}
```

| Status | `code`                              | Quando                                                                |
| ------ | ----------------------------------- | --------------------------------------------------------------------- |
| 400    | `invalid_request`                   | query, parâmetro ou corpo fora do schema                              |
| 401    | `unauthenticated` / `invalid_token` | sem token / token inválido, expirado ou revogado (`WWW-Authenticate`) |
| 403    | `forbidden`                         | usuário logado, mas sem o papel `admin`                               |
| 404    | `not_found`                         | recurso ou rota inexistente                                           |
| 413    | `payload_too_large`                 | corpo acima de 64 KB                                                  |
| 429    | `rate_limited`                      | limite de comparações por IP (`Retry-After` em segundos)              |
| 502    | `data_unavailable`                  | falha ao acessar o banco (detalhe só no log)                          |
| 500    | `internal_error`                    | erro inesperado (detalhe só no log)                                   |

O front trata indisponibilidade da API (`ApiUnavailableError`, tempo limite de 10 s) separadamente de respostas de erro (`ApiRequestError`).

## Como evoluir o contrato

1. Mudança **compatível** (campo opcional novo, endpoint novo): altere `shared/contracts`, a rota e o serviço; suba o _minor_ de `CONTRACT_VERSION`.
2. Mudança **incompatível** (remover/renomear campo, mudar tipo): suba o _major_ e migre API e front **no mesmo PR** (o monorepo permite). Ordem de implantação: banco → API → front.
3. O compilador acusa qualquer mapeador do `db` que divirja do contrato; os testes da API validam as respostas reais com os schemas; `pnpm arch:check` acusa import fora de lugar.
4. OpenAPI: não é gerado hoje (um único cliente, que usa os próprios schemas Zod). Gere a partir de `shared/contracts` quando surgir um cliente externo.

## Limitações conhecidas

- Limite de taxa e cache são **por instância** (em memória). Com várias instâncias da API o limite efetivo é maior; mover para Postgres/edge está no plano (ADR de segurança).
- O IP do cliente chega em `X-Forwarded-For`, repassado pelo Next. A API deve ficar atrás desse proxy (rede privada/firewall): exposta direto à internet, o cabeçalho poderia ser forjado para driblar o limite.
- O login por link mágico (limite de 5 tentativas/10 min) continua no Next por causa do PKCE (ver [arquitetura](architecture.md)).
