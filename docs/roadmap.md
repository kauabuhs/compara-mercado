# Roadmap e status das fases

Legenda: ✅ feito e verificado · 🟡 base pronta, falta completar · ⬜ não iniciado. Estimativas do plano: protótipo (fim da Fase 1) ≈ 3 semanas; MVP completo 8 a 10.

Metas do plano (a calibrar com dados reais): 50 usuários ativos/semana · ≥ 70% dos preços com < 7 dias · ≥ 90% de precisão em 50 itens · 2 mercados dispostos a pagar por destaque.

## Fase 0 — Fundação

**Critério:** merge na `main` faz deploy em staging; testes de RLS passam.

- ✅ Monorepo pnpm + Turborepo, TypeScript estrito, Biome, commitlint, Husky
- ✅ CI (lint, tipos, testes, build, banco do zero, tipos em dia, e2e) e segurança (gitleaks, audit, Semgrep)
- ✅ Schema base com RLS em todas as tabelas, auditoria, antiabuso; **47 testes pgTAP**
- ✅ Login (link mágico), design system mínimo (tokens, claro/escuro), ADR-0001
- 🟡 Projetos Supabase de staging e produção: criar e preencher secrets/environments (`deploy.yml` pronto)
- 🟡 Deploy automático em staging: depende dos projetos acima e do projeto na Vercel

## Fase 1 — Núcleo de comparação

**Critério:** com 6 mercados e ~100 itens, montar uma lista de 10 itens e ver o total por mercado em < 1 min.

- ✅ Busca (trigramas, sem acento), produto com preço por mercado, selo "mais barato", frescor
- ✅ Lista (local), total por mercado, melhor mercado único, melhor divisão entre dois, economia e distância extra, WhatsApp
- ✅ Mercados com mapa (MapLibre/OSM) e distância; ofertas; PWA instalável + última lista offline
- ✅ Layout responsivo (360 px → desktop), navegação inferior/lateral, modo claro/escuro
- ✅ Admin: lançar preço manual (publica e atualiza `current_prices`) e fila de revisão
- ✅ Lista de compras sincronizada com a conta (sem login continua no aparelho, inclusive offline) — [ADR-0015](adr/0015-lista-de-compras-na-conta.md)
- ✅ Admin: moderação de preços denunciados (retirar preço publicado, manter, motivo da rejeição visível a quem enviou) — [ADR-0016](adr/0016-moderacao-de-precos.md)
- 🟡 Seed com **6 mercados e 48 produtos** (plano pede ~100): ampliar com a cesta real da cidade
- ✅ Admin: cadastro de cidades, mercados, categorias e produtos (criar, editar, desativar/arquivar) — [ADR-0013](adr/0013-cadastro-base-pelo-painel-admin.md). Falta importação em lote e edição de marca
- ⬜ Histórico por produto por mercado na tela (existe por produto), alerta de preço, scanner de código de barras, onboarding de 3 telas, mercados favoritos, sugestões de busca

## Fase 2 — Encartes com IA

**Critério:** ≥ 90% de precisão em 50 itens do golden set; todo preço rastreável até o arquivo de origem.

- ✅ Pipeline completo e testado (extração → normalização → casamento → validação → publicação por confiança / revisão), com portas para testes
- ✅ Adaptador Claude (visão, PDF/imagem), saída validada por Zod, custo estimado e teto mensal
- ✅ Medição do golden set (`scoreAgainstGolden`) pronta
- ⬜ **Spike (1–2 dias): ler 3 encartes reais** e medir precisão — decide modelo e limiar
- ⬜ Upload/coleta de encartes (rota no servidor + EXIF + sha256) e enfileiramento (`enqueueProcessSource` existe)
- ⬜ Golden set real (encartes + gabarito) rodando no CI a cada mudança de prompt/modelo
- ⬜ Tela de revisão com a imagem ao lado do dado e atalhos de teclado; feedback vira alias
- ⬜ Persistir gasto de IA (hoje reinicia a cada subida do worker)

## Fase 3 — Comunidade e NFC-e

**Critério:** decisão sobre NFC-e em ADR; nenhum preço fraudulento no teste de abuso.

- ✅ Base no banco: contribuição nasce `pending`, limite diário (30), imutabilidade, auditoria
- ✅ **MVP de contribuição** ([ADR-0008](adr/0008-contribuicao-de-precos-com-foto.md)): `/contribuir` com foto obrigatória (comprimida no navegador, sanitizada na API, bucket privado), `/conta/envios`, revisão do admin com a foto ao lado do dado. Tudo vai para revisão humana; **falta rodar o beta fechado (2 semanas, 10–20 pessoas)** e medir adesão, aprovação e tempo de revisão antes de construir o resto
- ⬜ Leitura da etiqueta por IA e confirmação em 2 toques, reputação e pontos, publicação automática (só depois de validar o MVP)
- ⬜ Teste de abuso; spike NFC-e (técnico + jurídico) → ADR

## Comunidade e portal do mercado (plano de 2026-11-13)

Decisões: [ADR-0009](adr/0009-perfil-consentimento-e-cidade.md) (perfil, consentimento, cidade), [ADR-0010](adr/0010-comunidade-de-precos-e-confianca.md) (feed, corroboração, reputação) e [ADR-0011](adr/0011-portal-do-mercado.md) (lojista e campanhas). Ordem: **comunidade primeiro**, mercado depois.

- ✅ Fase 0 — fundação: ADRs 0009–0011, `docs/api.md` atualizado, seletor de cidade (cookie + perfil) e filtro de mercados por cidade
- ✅ Fase 1 — comunidade MVP (banco, API, telas): confirmações, denúncias, reputação, `GET /v1/community/feed`, `/comunidade`, `/conta/reputacao`, apelido público, navegação (Comunidade no lugar de Ofertas) e botão "Publicar". **Falta:** beta fechado na cidade piloto, exportar/excluir conta (LGPD) antes de abrir ao público, e evoluir `/contribuir` em passos (mercado mais próximo primeiro)
- ⬜ Fase 2 — portal do mercado: `store_members`, aprovação no admin, preços `store_panel` com selo _Oficial_, `/mercados/[id]`, portal `/loja`
- ⬜ Fase 3 — campanhas e retenção: campanhas com revisão, métricas, alerta de preço, web push, avaliar Realtime/SSE

## Fase 4 — Beta

**Critério:** 50 usuários ativos/semana; nenhum erro crítico aberto.

- ✅ Acesso: cadastro com confirmação de e-mail e aceite dos termos, login com senha (+ link de acesso), recuperação de senha e perfil da conta ([ADR-0012](adr/0012-autenticacao-e-acesso-admin.md)); como promover admin: [runbook](runbooks/promover-admin.md)
- 🟡 Política de privacidade e termos: texto inicial publicado em `/privacidade` e `/termos`; **falta revisão jurídica e o canal de contato do responsável**
- ⬜ Exportar/excluir conta (LGPD)
- ⬜ Sentry, PostHog, monitor externo, alertas de fila e orçamento
- ⬜ Auditoria de acessibilidade/desempenho (LCP < 2,5 s em 4G), teste de usabilidade com 5 pessoas
- ⬜ CSP com nonce, rate limit distribuído, CAPTCHA no login (ADR-0003)

## Próximos passos recomendados

1. Aprovar o ADR-0001 e decidir **nome, cidade e mercados** (decisões em aberto).
2. Rodar os **dois spikes** (3 encartes reais com IA; NFC-e) — são os riscos que derrubam o projeto.
3. Criar projetos Supabase staging/produção e conectar Vercel + GitHub.
4. Cadastrar o catálogo real pelo painel (ou importação em lote) e testar com 5 pessoas reais.

## Separação front-end / back-end (2026-11-11)

Feito e verificado: layout `ComparaMercado-Front/` · `ComparaMercado-Back/` ([ADR-0007](adr/0007-layout-front-back-por-aplicacao.md)); **API HTTP** (`ComparaMercado-Back`, Hono) com autenticação por token, autorização por papel e RLS; contratos Zod em `ComparaMercado-Back/src/contracts` (v2.0.0); front sem acesso a dados (cliente tipado da API); Dockerfiles de API e worker; CI com jobs por lado; `arch:check` com 9 regras. Detalhes no [ADR-0005](adr/0005-separacao-frontend-backend.md).
Em aberto: host da API e do worker; upload de arquivos da Fase 2 como endpoint da API; cache/rate limit compartilhados entre instâncias.

## Reestruturação arquitetural (2026-11-10)

Feito e verificado: contratos Zod compartilhados (hoje `ComparaMercado-Back/src/contracts`); front por funcionalidade (hoje `modules/`); `pnpm arch:check` na CI (7 regras, testadas com violações injetadas); [ADR-0004](adr/0004-fronteiras-e-contratos.md) e [`api.md`](api.md).
Em aberto: decidir a superfície de upload da Fase 2 sem `service_role` no web (ADR-0004); gerar OpenAPI só se surgir cliente HTTP externo.
