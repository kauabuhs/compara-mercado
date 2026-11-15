# Registro de bugs — QA ponta a ponta

Atualizado em 2026-11-15. Cada item tem evidência reproduzível. **Nenhum foi corrigido nesta rodada**: o QA registra, a correção é uma etapa separada.

Severidade: **Bloqueante** (impede lançar) · **Crítico** · **Maior** · **Menor** · **Cosmético**. "Teste" aponta o teste que reproduz ou protege o item.

| ID     | Sev.       | Onde                                     | Resumo                                                           | Status                |
| ------ | ---------- | ---------------------------------------- | ---------------------------------------------------------------- | --------------------- |
| QA-001 | Bloqueante | Banco (`price_observations`, `profiles`) | Excluir usuário que tem preço registrado falha                   | Aberto                |
| QA-002 | Menor      | `/admin` (Front)                         | Usuário comum gera `ApiRequestError 403` não tratado no servidor | Aberto                |
| QA-003 | Menor      | `POST /v1/shopping-lists/compare`        | `502 data_unavailable` intermitente, sem nova tentativa          | Aberto (intermitente) |
| QA-004 | Menor      | API (cache) × admin                      | Item arquivado/desativado segue visível por até 60 s             | Aberto                |
| QA-005 | Menor      | Ambiente                                 | Node 24.14.0 instalado; o projeto exige ≥ 24.22.1                | Aberto                |

## QA-001 — Excluir conta com preço registrado falha (Bloqueante para LGPD)

- **Esperado:** apagar o usuário em `auth.users` remove o perfil e mantém os preços publicados sem autoria (`created_by = null`), como diz a FK `on delete set null`.
- **Obtido:** `ERROR: observações de preço são imutáveis (apenas status e aprovação mudam)` (SQLSTATE 42501). A FK dispara `UPDATE price_observations SET created_by = NULL`, e `price_observations_guard()` (`20261114000001_community_foundation.sql:25`) trata `created_by` como imutável.
- **Efeito:** quem já enviou ou teve qualquer preço lançado **não pode ser excluído**. Isso bloqueia o item "exportar/excluir conta (LGPD)", pré-requisito do lançamento público (ADRs 0008, 0009, 0012, 0015). O mesmo vale para `sources.uploaded_by` e outras FKs `set null` ligadas a tabelas com guarda.
- **Reproduzir:** `ComparaMercado-Back/supabase/tests/database/17_account_deletion.test.sql` (asserções 4 e 5 como `TODO`; a suíte passa, mas imprime `Failed (TODO)`). Ou, no psql local, dentro de uma transação: inserir usuário, inserir uma `price_observations` com `created_by` dele, `delete from auth.users`.
- **Direção da correção (a decidir, ADR):** a guarda aceitar `created_by: <id> → null` quando a mudança vem da FK (ex.: `pg_trigger_depth() > 1`), ou anonimizar antes de excluir por função própria. Também limpar as fotos do bucket `contributions` (hoje nada as remove).
- **Teste:** `17_account_deletion.test.sql` (retirar o `todo_start`/`todo_end` ao corrigir).

## QA-002 — `/admin` para usuário comum registra erro 403 não tratado

- **Esperado:** o layout redireciona para `/conta?aviso=sem-permissao` sem chamar a API de admin.
- **Obtido:** a pessoa é redirecionada corretamente, mas o servidor registra `⨯ Error [ApiRequestError]: Acesso restrito a administradores. status: 403` em `src/app/admin/page.tsx`: a página busca o resumo em paralelo à guarda do layout.
- **Efeito:** ruído nos logs (pode esconder erros reais ou disparar alertas falsos quando houver monitoramento) e uma chamada desnecessária. Sem impacto visível para quem usa.
- **Evidência:** saída `[WebServer]` do e2e `auth.spec.ts › usuário comum não entra no painel e vê o motivo` e `contribuir.spec.ts › usuário comum não entra no painel…`.
- **Direção:** a página tratar 403 (ou checar o papel antes de buscar).

## QA-003 — Comparação de lista: `502 data_unavailable` intermitente

- **Esperado:** a comparação responde, ou a tela se recupera sozinha.
- **Obtido:** em 1 de 62 execuções do e2e (e em 2 reexecuções seguidas do mesmo par de testes) o servidor registrou `comparação de lista falhou data_unavailable` e a tela mostrou "Não foi possível comparar agora". Depois passou várias vezes.
- **Causa provável (não confirmada):** timeout do cliente Supabase sob carga local com 2 workers. A chamada direta à API e ao RPC `compare_list` funciona.
- **Efeito:** a pessoa precisa tentar de novo manualmente; não há nova tentativa automática nem botão "Tentar de novo".
- **Teste:** `recursos-do-navegador.spec.ts › na lista: 'Considerar distância' mantém o total…` (intermitente).
- **Direção:** investigar o timeout (`supabase-timeout`), e oferecer "Tentar de novo" no cartão de erro.

## QA-004 — Arquivar/desativar no admin não vale na hora para o público

- **Esperado:** o diálogo de arquivar diz "O produto sai da busca e das comparações". Espera-se que saia logo.
- **Obtido:** a busca pública continuou mostrando o produto arquivado logo após a ação. As leituras públicas passam por um cache em memória na API (60 s; mercados e cidades 5 min) que a escrita do admin não invalida; o Front só invalida o cache do Next (`updateTag`). Depois de 60 s o produto some.
- **Efeito:** janela de até 60 s (5 min para mercados e cidades, **a verificar**) em que algo desativado aparece. Com mais de uma instância da API, o problema é maior. É coerente com a limitação documentada ("cache por instância"), mas contradiz o texto do diálogo.
- **Teste:** `admin-cadastro.spec.ts › produtos…` (hoje espera "some em até 60 s"; passará na primeira checagem quando o cache for invalidado na escrita).
- **Direção:** invalidar a chave do cache na escrita (ou TTL menor), ou ajustar o texto para "em até 1 minuto".

## QA-005 — Versão do Node abaixo da exigida

`.nvmrc` e `engines` pedem Node ≥ 24.22.1; a máquina de teste tem 24.14.0. Nada quebrou, mas o resultado de QA vale para essa versão. Alinhar antes de fechar o relatório final.

## Dívida de teste (não é bug do produto)

| ID    | Teste                                                           | Problema                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001 | `comunidade.spec.ts › publica, outra pessoa confirma…` (mobile) | Localiza o cartão pelo **preço** (`R$ 3,73`); acha o cartão de uma execução anterior (`Colaborador #F071`). Precisa de preço realmente único por execução ou localizar pelo apelido. Falhou na linha de base do mobile. |
| T-002 | `contribuir.spec.ts › usuário comum não entra no painel…`       | Passa isolado; falhou uma vez em execução completa (`Target page… has been closed`): corrida.                                                                                                                           |
| T-003 | `admin-cadastro.spec.ts › produtos…`                            | Leva ~2,5 min por esperar o TTL do cache (QA-004). Some quando o cache for invalidado na escrita.                                                                                                                       |
