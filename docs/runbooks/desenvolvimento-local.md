# Runbook — desenvolvimento local

## Subir tudo

```bash
pnpm install
pnpm db:start                                                   # Supabase local (aplica migrações + seed)
pnpm exec supabase status -o env --workdir ComparaMercado-Back  # copie API_URL e ANON_KEY
# ComparaMercado-Back/.env:
#   SUPABASE_URL=<API_URL>
#   SUPABASE_ANON_KEY=<ANON_KEY>
# ComparaMercado-Front/.env.local:
#   NEXT_PUBLIC_SUPABASE_URL=<API_URL>
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
#   API_URL=http://127.0.0.1:4000
```

### Iniciar Back e Front em terminais separados

Cada aplicação é um processo independente; suba **o Back primeiro** (o Front só funciona com a API no ar, pois não acessa o banco):

| Aba | Comando           | Endereço              | Confirmação                        |
| --- | ----------------- | --------------------- | ---------------------------------- |
| 1   | `pnpm dev:back`   | http://127.0.0.1:4000 | `GET /healthz` → `{"status":"ok"}` |
| 2   | `pnpm dev:front`  | http://localhost:3000 | página inicial lista as ofertas    |
| 3   | `pnpm dev:worker` | — (opcional)          | log `worker no ar`                 |

Atalhos (todos equivalentes a rodar os comandos acima, um por aba):

- `pnpm dev:abas` — abre o Windows Terminal com uma aba por processo (`pnpm dev:abas -- -Worker` inclui o worker).
- VS Code: **Terminal → Executar tarefa → "Iniciar Back + Front"** (painel dedicado para cada um; há tarefas avulsas para cada processo).
- `pnpm dev` — os dois no mesmo terminal via Turborepo (saída intercalada; prefira abas separadas para depurar).

Para parar, `Ctrl+C` na aba do processo; cada um para sem afetar o outro. O Back reinicia sozinho ao salvar arquivos (`tsx watch`) e o Front recarrega (HMR).

O worker lê o mesmo `ComparaMercado-Back/.env`: acrescente `DATABASE_URL` (`DB_URL` do status), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`SERVICE_ROLE_KEY`) e `AI_PROVIDER=fake`. Para IA real: `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (gasta dinheiro; mantenha `AI_MONTHLY_BUDGET_CENTS` baixo).

## Problemas comuns

| Sintoma                                                    | Causa provável                                                              | Solução                                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `supabase start` falha com _unhealthy_ do Studio/analytics | máquina/Docker sem recursos                                                 | `pnpm exec supabase stop` e suba só o essencial: `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor` |
| Healthchecks estourando 2 s                                | containers de uma subida anterior ainda rodando                             | `supabase stop` e suba de novo                                                                                              |
| `permission denied for function/table …` num teste         | `GRANT` faltando (o schema nega por padrão)                                 | ajuste a migração e rode `pnpm db:reset && pnpm db:test`                                                                    |
| Tipos do banco desatualizados no CI                        | esqueceu `pnpm db:types`                                                    | rode e commite                                                                                                              |
| e2e travado                                                | muitas execuções paralelas contra um servidor                               | rode por projeto: `playwright test --project=desktop`                                                                       |
| `Variáveis de ambiente inválidas` ao abrir o site          | `ComparaMercado-Front/.env.local` ausente                                   | veja acima                                                                                                                  |
| Páginas com erro "API do back-end está indisponível"       | API não está rodando (ou `API_URL` errada)                                  | `pnpm dev:back` e confira `API_URL` em `ComparaMercado-Front/.env.local`                                                    |
| e2e: "Não foi possível comparar agora" em testes da lista  | a API limita a comparação a 30 req/min por IP e a suíte inteira passa disso | rode por projeto (`--project=desktop`) ou rode o arquivo isolado (`playwright test e2e/recursos-do-navegador.spec.ts`)      |
| Porta ocupada no e2e (3100/4100)                           | servidor de teste de uma execução anterior                                  | encerre o processo que segura a porta e rode de novo                                                                        |

## Login local (link mágico)

O login é por e-mail sem senha. Localmente os e-mails caem no **Mailpit**: http://127.0.0.1:54324 (sobe junto com `pnpm db:start`; se você usou `-x inbucket`, o login não completa). Entre com `admin@local.test`, abra o e-mail e clique no link: ele volta para `http://localhost:3000/auth/callback`. Isso depende de `site_url` e `additional_redirect_urls` em `ComparaMercado-Back/supabase/config.toml` apontarem para `localhost:3000`; depois de mudá-los, reinicie o Supabase (`db:stop` + `db:start`). Acesse sempre por `localhost`, não `127.0.0.1`: o cookie do PKCE é por host.

## Dados de teste

`ComparaMercado-Back/supabase/seed.sql` cria 1 cidade piloto, 6 mercados fictícios, 48 produtos e 265 preços com datas e promoções variadas, mais o admin `admin@local.test`. **Nunca roda em staging/produção.**
