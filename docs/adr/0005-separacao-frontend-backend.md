# ADR-0005 — Separação em `frontend/`, `backend/` e `shared/`, com API HTTP própria

- **Status:** Proposto
- **Data:** 2026-11-11
- **Decisor:** Kauã Buhs
- **Substitui:** a decisão "sem servidor de API dedicado" do [ADR-0004](0004-fronteiras-e-contratos.md)
- **Complementa:** [ADR-0001](0001-stack.md), [ADR-0002](0002-supply-chain.md)

## Contexto

Pediu-se uma separação física, lógica e arquitetural entre front-end e back-end, com o front consumindo o back por uma API bem definida e sem acesso do navegador a recursos privados do banco. A auditoria do código (2026-11-11) mostrou:

- **Não havia API HTTP.** O Next lia o Supabase direto em 8 páginas (via `@compara/db`) e tinha 3 Server Actions + 1 Route Handler com cliente de sessão. Nada usava `service_role` no front, mas o front **fazia persistência**: `createManualPrice` inseria em `price_observations` e chamava `refresh_current_prices`; `reviewObservation` atualizava o status.
- **Regra de negócio no lado errado.** O fim de validade de oferta (`23:59:59-03:00`) estava no front; o front importava `@compara/domain` só para formatar preço e classificar frescor (7/14 dias).
- O ADR-0004 adiou a API até haver um gatilho. O pedido explícito de separar e de fazer o front consumir uma API é o gatilho (c) daquele ADR.

## Decisão

1. **Layout:** `frontend/` (Next + `packages/ui`), `backend/` (`apps/api`, `apps/worker`, `packages/{ai,db,domain,ingest}`, `supabase/`) e `shared/` (`contracts`, `config`). Um só `pnpm-lock.yaml` e um só Turborepo na raiz; cada lado com dependências e scripts próprios.
2. **Criar `backend/apps/api`** com **Hono** (+ `@hono/node-server`). Motivos: pequeno e tipado; usa `Request/Response` padrão, então as rotas são testadas com `app.request()` sem abrir porta; sem decorators nem runtime pesado; roda em Node/container. Alternativas descartadas abaixo.
3. **Contratos em `shared/contracts` como schemas Zod** (rotas em `apiRoutes`, requests, responses, erro). O back valida o que recebe; o front valida o que lê. `CONTRACT_VERSION` sobe para 2.0.0 (campos novos `ageDays`/`freshness` em `PriceOffer`).
4. **A API não usa `service_role`.** Valida o JWT no Supabase (`auth.getUser`), lê o papel em `profiles` e executa operações administrativas com um cliente que **age como o usuário** (`createUserClient`). A RLS continua sendo a barreira final; `service_role` segue exclusivo do worker.
5. **Apresentação sai do `domain`; regra fica nele.** `formatBRL`, rótulos de unidade e o texto de idade (`atualizado há N dias`) vão para `frontend/packages/ui`. A classificação de frescor continua em `domain` e a API a devolve pronta (`freshness`, `ageDays`).
6. **Sessão fica no Next (exceção deliberada).** `signInWithEmail`, `signOut` e `auth/callback` continuam no front: o fluxo PKCE do link mágico exige que o servidor que iniciou o login (e guarda o verificador em cookie) seja o que troca o código. Usam só a chave pública. O token do cookie é repassado à API, que o valida.
7. **Fronteiras executáveis.** `pnpm arch:check` ganha regras para o novo layout: front e back nunca se importam (R3), `shared` não importa nenhum dos dois, segredos do back nunca aparecem no front (R7), `@supabase/*` no front só em `shared/server/supabase/` (R6), rotas da API não tocam persistência (R8).
8. **Cache das leituras públicas na API** (60 s; mercados 5 min), em memória. Ver "Consequências".
9. **Build e deploy independentes:** Dockerfile próprio para API e worker, jobs de CI separados por lado, `frontend` constrói sem a API no ar.

## Alternativas descartadas

- **Manter o front lendo o banco (ADR-0004).** Funciona e é mais barato, mas contraria o requisito (persistência e regra no back) e deixa o front como segundo lugar onde esquecer uma regra de autorização.
- **NestJS** como servidor: decorators, módulos e DI para ~12 endpoints; mais peso e curva sem ganho proporcional. **Fastify**: ótima opção, mas com mais superfície (plugins, esquema próprio) do que o necessário aqui; Hono cobre o caso com menos código e testabilidade melhor.
- **Browser chamando a API direto.** Exigiria CORS, expor a URL da API, guardar o token fora de cookie `httpOnly` e abrir o CSP. Descartado: o Next age como camada de apresentação e repassa o token.
- **Mover o login para a API.** O PKCE do Supabase quebraria (o verificador fica no navegador/servidor que iniciou). Exigiria trocar para fluxo implícito, menos seguro. Descartado.
- **Usar `service_role` na API para administração.** Mais simples, porém ignora a RLS e põe a autorização inteira em código. Descartado: privilégio mínimo.
- **Pastas `infrastructure/` e `docs/decisions/` do modelo de referência.** Os Dockerfiles ficam junto de cada app e os ADRs já estão em `docs/adr`; criar as pastas só para igualar o desenho geraria vazio sem ganho.

## Consequências

- (+) Front sem regra de negócio, sem SQL e sem `service_role`; trocar o banco ou o modelo de dados não recompila o front.
- (+) A API é um único ponto para autorização, validação de entrada, limite de taxa, cache e logs; serve a futuros clientes (app nativo, parceiros).
- (+) Cada lado compila, testa e implanta sozinho; a CI mostra qual lado quebrou.
- (−) **Mais um serviço em produção** (hospedagem, monitoramento, variáveis) e um salto de rede por página. Aumenta o custo operacional do piloto; o host da API/worker segue em aberto (ADR-0001).
- (−) **O cache de dados do Next não funcionou como esperado.** Medimos: com `fetch(..., { next: { revalidate } })` em páginas renderizadas sob demanda, N cargas geravam N chamadas à API (com e sem `AbortSignal`, com e sem `fetchCache = "default-cache"`). Em vez de depender de comportamento interno do Next, o cache passou para a API (`x-cache: HIT/MISS`). Efeito: as páginas públicas deixam de ser pré-renderizadas (ISR) e passam a renderizar a cada requisição, com os dados vindos do cache da API.
- (−) Limite de taxa e cache são **por instância**. Com mais de uma instância da API o limite efetivo é maior.
- (−) O IP do cliente chega por `X-Forwarded-For`; a API precisa ficar atrás do proxy (rede privada/firewall) para não permitir forjar o cabeçalho.
- (−) O limitador do login (5/10 min) fica no Next e o da comparação (30/min) na API: duas implementações pequenas do mesmo algoritmo, porque `frontend` e `backend` não compartilham código.
- (−) Uma mudança de formato exige tocar `shared/contracts`, a rota e o serviço (e o front, se for incompatível). É intencional.

## Pendências e riscos conhecidos

- **Upload de arquivos (Fase 2):** continua em aberto, agora com resposta natural: um endpoint na API (ou URL assinada gerada por ele), sem `service_role` no front. A regra R7 já impede o desenho antigo.
- **Implantação:** ainda não há host para API/worker; `deploy.yml` tem os jobs comentados. Ordem segura de mudança de contrato: banco → API → front.
- **Dockerfiles** construídos localmente; a CI (`images`) só será exercitada no GitHub depois do primeiro push.
- **CSP:** `connect-src` do front ainda lista o Supabase, embora o navegador não o acesse mais; pode ser removido numa limpeza de segurança.
