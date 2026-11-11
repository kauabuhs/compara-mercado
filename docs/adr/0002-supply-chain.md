# ADR-0002 — Endurecimento da cadeia de suprimentos

- **Status:** Aceito
- **Data:** 2026-11-09

## Contexto

Pacotes npm recém-publicados e comprometidos são um vetor real. O projeto instala muitas dependências transitivas (Next, Supabase, pg-boss, SDK de IA). A análise estática do ambiente de desenvolvimento apontou ausência dessas proteções.

## Decisão

Em `pnpm-workspace.yaml`:

- `minimumReleaseAge: 10080` — só instala versões publicadas há ≥ 7 dias.
- `blockExoticSubdeps: true` — dependências transitivas não podem vir de git/tarball.
- `trustPolicy: no-downgrade` — bloqueia atualização que perca garantias de publicação (provenance).

Além disso: `pnpm install --frozen-lockfile` no CI; scripts de instalação desligados por padrão (aprovar com `pnpm approve-builds`); Dependabot com `cooldown` de 7 dias; `pnpm audit`, Semgrep e gitleaks no CI.

**Runtime:** Node ≥ 24.22.1 (`.nvmrc`, `engines`, Dockerfile). Versões anteriores da linha 24 têm CVE conhecida no decodificador Brotli.

## Consequências

- ➕ Janela para a comunidade detectar pacotes maliciosos antes de entrarem.
- ➖ Correção de segurança urgente de dependência recém-publicada exige exceção explícita (`minimumReleaseAgeExclude`) com justificativa no PR.
- Ações do GitHub estão referenciadas por tag major. Endurecimento futuro: fixar por SHA de commit (Dependabot mantém).

## Adendo (2026-11-11) — scripts de instalação

O pnpm 12 sai com **código 1** quando uma dependência tem script de build não aprovado nem negado (`ERR_PNPM_IGNORED_BUILDS`). Isso quebraria `pnpm install --frozen-lockfile` na CI e nos builds Docker. Decisão: **negar explicitamente** o script do `esbuild` (`allowBuilds: { esbuild: false }` em `pnpm-workspace.yaml`). Ele já funcionava sem o script (o binário vem do pacote opcional da plataforma), e a política continua sendo não executar código de instalação de terceiros. Qualquer nova dependência com script de build exige decisão explícita (`pnpm approve-builds`) e registro aqui.
