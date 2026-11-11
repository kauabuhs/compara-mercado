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
- 🟡 Seed com **6 mercados e 48 produtos** (plano pede ~100): ampliar com a cesta real da cidade
- 🟡 Admin: cadastro (CRUD) de cidades, mercados e produtos — hoje por SQL/seed
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
- ⬜ Foto de etiqueta (câmera, leitura por IA, confirmação em 2 toques), reputação e pontos
- ⬜ Teste de abuso; spike NFC-e (técnico + jurídico) → ADR

## Fase 4 — Beta

**Critério:** 50 usuários ativos/semana; nenhum erro crítico aberto.

- ⬜ Política de privacidade e termos; exportar/excluir conta (LGPD)
- ⬜ Sentry, PostHog, monitor externo, alertas de fila e orçamento
- ⬜ Auditoria de acessibilidade/desempenho (LCP < 2,5 s em 4G), teste de usabilidade com 5 pessoas
- ⬜ CSP com nonce, rate limit distribuído, CAPTCHA no login (ADR-0003)

## Próximos passos recomendados

1. Aprovar o ADR-0001 e decidir **nome, cidade e mercados** (decisões em aberto).
2. Rodar os **dois spikes** (3 encartes reais com IA; NFC-e) — são os riscos que derrubam o projeto.
3. Criar projetos Supabase staging/produção e conectar Vercel + GitHub.
4. Terminar o CRUD de admin e ampliar o seed para ~100 itens; testar com 5 pessoas reais.

## Separação front-end / back-end (2026-11-11)

Feito e verificado: layout `frontend/` · `backend/` · `shared/`; **API HTTP** (`backend/apps/api`, Hono) com autenticação por token, autorização por papel e RLS; contratos Zod em `shared/contracts` (v2.0.0); front sem acesso a dados (cliente tipado da API); Dockerfiles de API e worker; CI com jobs por lado; `arch:check` com 9 regras. Detalhes no [ADR-0005](adr/0005-separacao-frontend-backend.md).
Em aberto: host da API e do worker; upload de arquivos da Fase 2 como endpoint da API; cache/rate limit compartilhados entre instâncias.

## Reestruturação arquitetural (2026-11-10)

Feito e verificado: pacote `@compara/contracts`; front por funcionalidade (`features/`, `shared/`); `pnpm arch:check` na CI (7 regras, testadas com violações injetadas); [ADR-0004](adr/0004-fronteiras-e-contratos.md) e [`api.md`](api.md).
Em aberto: decidir a superfície de upload da Fase 2 sem `service_role` no web (ADR-0004); gerar OpenAPI só se surgir cliente HTTP externo.
