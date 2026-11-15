# Registro de bugs — QA ponta a ponta

Atualizado em 2026-11-15. Cada item tem evidência reproduzível. **Nenhum foi corrigido nesta rodada**: o QA registra, a correção é uma etapa separada.

Severidade: **Bloqueante** (impede lançar) · **Crítico** · **Maior** · **Menor** · **Cosmético**. "Teste" aponta o teste que reproduz ou protege o item.

| ID     | Sev.       | Onde                                     | Resumo                                                             | Status                |
| ------ | ---------- | ---------------------------------------- | ------------------------------------------------------------------ | --------------------- |
| QA-001 | Bloqueante | Banco (`price_observations`, `profiles`) | Excluir usuário que tem preço registrado falha                     | Aberto                |
| QA-002 | Menor      | `/admin` (Front)                         | Usuário comum gera `ApiRequestError 403` não tratado no servidor   | Aberto                |
| QA-003 | Menor      | `POST /v1/shopping-lists/compare`        | `502 data_unavailable` intermitente, sem nova tentativa            | Aberto (intermitente) |
| QA-004 | Menor      | API (cache) × admin                      | Item arquivado/desativado segue visível por até 60 s               | Aberto                |
| QA-005 | Menor      | Ambiente                                 | Node 24.14.0 instalado; o projeto exige ≥ 24.22.1                  | Aberto                |
| QA-006 | Maior      | `compare_list` (banco)                   | Produto arquivado pelo admin continua entrando na comparação       | Aberto                |
| QA-007 | Menor      | `compare_list` (banco)                   | `total_cents` estoura `integer` com quantidades somadas altas      | Aberto                |
| QA-008 | Menor      | `POST /v1/contributions`                 | Foto rejeitada ou com falha no registro fica órfã no bucket        | Aberto                |
| QA-009 | Menor      | `evaluate_observation` (banco)           | Dois "mudou" em preço já aprovado não abrem tarefa (a confirmar)   | Aberto (a confirmar)  |
| QA-010 | Menor      | Lançar preço e Contribuir                | Valor acima do teto é recusado com mensagem genérica               | Aberto                |
| QA-011 | Menor      | `/admin/revisao`                         | Decidir envio já decidido por outro admin cai em "Algo deu errado" | Aberto                |
| QA-012 | Menor      | `/produto/[id]`                          | Produto inexistente responde HTTP 200 (soft 404)                   | Aberto                |
| QA-013 | Menor      | API de busca                             | Byte nulo (`%00`) na busca vira 502 e registra erro                | Aberto                |
| QA-014 | Cosmético  | `/busca`                                 | Erro de digitação por letra faltando não acha o produto (`fejao`)  | Aberto (melhoria)     |

## QA-001 — Excluir conta com preço registrado falha (Bloqueante para LGPD)

- **Esperado:** apagar o usuário em `auth.users` remove o perfil e mantém os preços publicados sem autoria (`created_by = null`), como diz a FK `on delete set null`.
- **Obtido:** `ERROR: observações de preço são imutáveis (apenas status e aprovação mudam)` (SQLSTATE 42501). A FK dispara `UPDATE price_observations SET created_by = NULL`, e `price_observations_guard()` (`20261114000001_community_foundation.sql:25`) trata `created_by` como imutável.
- **Efeito:** quem já enviou ou teve qualquer preço lançado **não pode ser excluído**. Isso bloqueia o item "exportar/excluir conta (LGPD)", pré-requisito do lançamento público (ADRs 0008, 0009, 0012, 0015). O mesmo vale para `sources.uploaded_by` e outras FKs `set null` ligadas a tabelas com guarda.
- **Reproduzir:** `ComparaMercado-Back/supabase/tests/database/17_account_deletion.test.sql` (asserções 4 e 5 como `TODO`; a suíte passa, mas imprime `Failed (TODO)`). Ou, no psql local, dentro de uma transação: inserir usuário, inserir uma `price_observations` com `created_by` dele, `delete from auth.users`.
- **Direção da correção (a decidir, ADR):** a guarda aceitar `created_by: <id> → null` quando a mudança vem da FK (ex.: `pg_trigger_depth() > 1`), ou anonimizar antes de excluir por função própria. Também limpar as fotos do bucket `contributions` (hoje nada as remove).
- **Teste:** `17_account_deletion.test.sql` (retirar o `todo_start`/`todo_end` ao corrigir).

## QA-002 — `/admin` para usuário comum registra erro 403 não tratado

- **Esperado:** o layout redireciona para `/conta?aviso=sem-permissao` sem chamar a API de admin.
- **Obtido:** a pessoa é redirecionada corretamente, mas o servidor registra `⨯ Error [ApiRequestError]: Acesso restrito a administradores. status: 403`: cada tela do painel (`/admin`, `/admin/cidades`, `/admin/categorias`, `/admin/produtos`, `/admin/mercados`…) busca os próprios dados em paralelo à guarda do layout. O spec `admin-acesso.spec.ts` percorre as 8 telas como usuário comum e o log mostra o erro nas telas de cadastro também.
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

## QA-006 — Produto arquivado ainda entra na comparação da lista

- **Esperado:** o diálogo de arquivar diz "O produto sai da busca e das comparações". Um produto arquivado não deveria ter preço comparado.
- **Obtido:** `compare_list` lê `current_prices`, que não filtra o status do produto (a view só olha `price_observations`). `list_offers_page` filtra `p.status = 'active'`; `compare_list` não. Resultado: quem já tem o produto na lista (no aparelho ou na conta) continua vendo o preço e o total dele, enquanto a busca e as ofertas já o esconderam.
- **Reproduzir:** `19_compare_edges.test.sql` (asserção 11, `TODO`): arquivar o produto, `refresh materialized view current_prices`, e `compare_list` devolve `total_cents = 500` em vez de nulo.
- **Direção:** `join products p on p.id = cp.product_id and p.status = 'active'` no CTE `prices` de `compare_list` (nova migração, nunca editar a aplicada) e, no front, avisar quando um item da lista ficou indisponível.
- **Teste:** `19_compare_edges.test.sql` (retirar o `todo_start`/`todo_end`).

## QA-007 — `total_cents` estoura `integer` na comparação

- **Esperado:** um total grande é devolvido, ou a API recusa a lista com mensagem clara.
- **Obtido:** `sum(price_cents::bigint * quantity)::integer` falha com `22003 integer out of range` quando o total passa de 2.147.483.647 centavos (R$ 21,4 milhões). O contrato limita cada item a 99 unidades, mas o mesmo produto repetido soma sem teto no SQL (3 × 99 unidades de R$ 100.000,00 já estoura).
- **Efeito:** na prática exige preço absurdo ou chamada direta à API; o resultado é uma falha (502) e não um total errado. Risco baixo, mas a falha é silenciosa para quem usa.
- **Reproduzir:** `19_compare_edges.test.sql` (asserções 12 `TODO` e 13, que documenta o `22003` atual).
- **Direção:** devolver `bigint` (o contrato já usa número do JS) ou limitar a soma por produto a 99 no SQL e no `mergeItems`.
- **Observação relacionada:** o contrato do lançamento de preço pelo admin aceita até R$ 999.999,99 (`ManualPriceRequestSchema`), mas a coluna `price_observations.price_cents` tem `check` até R$ 100.000,00. Acima disso o banco recusa; falta confirmar se a API devolve mensagem amigável (cobrir em `admin-precos`).

## QA-008 — Foto órfã no bucket `contributions`

- **Esperado:** foto que não virou envio não permanece guardada.
- **Obtido:** o serviço grava o arquivo **antes** de registrar a fonte e nada o remove se o registro falhar. Isso vale para foto repetida de outra pessoa (hash único, 409), para erro de rede no registro e para o envio duplo do mesmo arquivo (um ganha, o outro deixa o arquivo para trás). O repositório nem tem operação de remover foto.
- **Efeito:** arquivos de pessoas ficam no armazenamento sem registro que os ligue a alguém, o que pesa para a LGPD e para o custo. Junto com QA-001 (o bucket nunca é limpo ao excluir conta).
- **Reproduzir:** `contributions.service.test.ts` (`it.fails` "QA-008…", 2 casos). O envio duplo está coberto como caminho feliz da corrida (um vence, o outro recebe 409).
- **Direção:** `removePhoto(path)` no repositório e `catch` que apaga o arquivo quando a fonte não é criada; job de varredura para arquivos sem `sources`.

## QA-009 — "Mudou" duas vezes em preço já aprovado não gera tarefa (a confirmar)

- **Esperado (ADR-0010):** "≥ 2 vereditos 'mudou' ou ≥ 3 denúncias tiram a publicação do feed e abrem `review_task`".
- **Obtido:** `evaluate_observation` só age sobre preço **pendente**. Em preço `approved`, dois "mudou" ficam registrados (aparecem na contagem do cartão), mas o preço continua publicado e nenhuma tarefa é criada. Só denúncias (3) abrem tarefa para preço aprovado.
- **Efeito:** a comunidade sinaliza "o preço mudou" e nada acontece até alguém denunciar. Pode ser intencional (aprovado por admin não deveria cair por voto), por isso fica **a confirmar com o produto**.
- **Reproduzir:** `18_community_edges.test.sql` (últimas asserções: documentam o comportamento atual).
- **Direção:** decidir a regra; se for abrir tarefa, tratar `approved` na função de confirmação.

## QA-010 — Valor acima do teto é recusado com mensagem genérica

- **Esperado:** a pessoa descobre que o valor passou do limite e qual é o limite.
- **Obtido (admin, lançar preço):** o formulário e o contrato aceitam até R$ 999.999,99 (`ManualPriceRequestSchema`, `pattern` de 6 dígitos), mas a coluna `price_observations.price_cents` tem `check` até R$ 100.000,00. Lançar R$ 100.000,01 devolve "Não foi possível salvar o preço." (R$ 100.000,00 funciona).
- **Obtido (contribuir):** o campo aceita 6 dígitos, mas a API limita a R$ 10.000,00; R$ 10.000,01 devolve "Não foi possível enviar agora. Tente de novo em instantes.", que sugere falha temporária e convida a repetir. O que a pessoa digitou é preservado (bom).
- **Direção:** alinhar o contrato e o banco (um só teto, por origem, documentado) e devolver mensagem específica ("O preço máximo é R$ 10.000,00").
- **Teste:** `admin-precos.spec.ts › teto…` e `contribuir-validacoes.spec.ts › preço…`.

## QA-011 — Fila de revisão: envio já decidido por outro admin derruba a tela

- **Esperado:** como na moderação, tratar o 404 ("outra pessoa já decidiu") e recarregar a fila.
- **Obtido:** `reviewObservation` lança `Error("falha ao revisar")` em qualquer falha, inclusive 404. A tela cai em `error.tsx` ("Algo deu errado"). `decideModeration` (moderação) trata o 404 corretamente: a comparação mostra a inconsistência.
- **Efeito:** com dois admins na fila (o caso comum quando a equipe cresce), o segundo clique perde a tela e precisa recarregar. Também vale para queda da API (sem mensagem).
- **Teste:** `admin-moderacao.spec.ts › fila de revisão: se outra pessoa já decidiu…` (documenta o comportamento atual; trocar a asserção ao corrigir).

## QA-012 — Produto inexistente responde HTTP 200

- **Esperado:** 404 para `/produto/<id inexistente>`.
- **Obtido:** a página mostra "Página não encontrada", mas o status HTTP é 200 (a resposta já começou a ser enviada por streaming quando `notFound()` roda). Uma rota inexistente (`/rota-que-nao-existe`) responde 404 corretamente.
- **Efeito:** robôs e links quebrados são tratados como página válida (SEO); sem impacto para a pessoa.
- **Direção:** validar o produto antes de iniciar o streaming (por exemplo na `generateMetadata`/layout da rota) ou aceitar o comportamento e marcar `noindex`.
- **Teste:** `busca-filtros.spec.ts › produto: id inválido e inexistente…`.

## QA-013 — Byte nulo na busca vira 502 e registra erro

- **Esperado:** `400` (ou o caractere é ignorado).
- **Obtido:** `GET /v1/products/search?q=a%00b`, `/v1/offers?q=a%00b` e `/v1/cities/search?q=%00` chegam ao Postgres, que recusa o byte nulo (`unsupported Unicode escape sequence`): a API responde 502 `data_unavailable` e registra erro nível `error`. No Front, `/api/cidades?q=%00` responde 503.
- **Efeito:** qualquer pessoa gera alertas de erro com uma URL; com monitoramento ligado isso vira ruído ou alarme falso. Sem vazamento nem execução.
- **Direção:** `.refine` no Zod dos termos de busca (sem caracteres de controle) ou `replace(/\u0000/g, "")` antes de chamar o RPC.
- **Teste:** `cidade.spec.ts › QA-013…` (`test.fail`: passa a falhar quando for corrigido, aí troque por `test`).

## QA-014 — Busca com letra faltando não acha o produto (melhoria)

- **Esperado:** a tela promete "Tentamos entender mesmo com erro de digitação".
- **Obtido:** `fijao`, `feijaoo`, `aroz` e `arros` acham o produto; `fejao` (letra faltando em palavra curta) devolve 0 resultados. O limite de similaridade (`word_similarity >= 0.5`) é alto para palavras de 5–6 letras.
- **Efeito:** quem erra assim vê "Nada encontrado" mesmo o produto existindo. Impacto baixo; melhora medindo com termos reais do beta.
- **Direção:** testar limite 0,4 ou busca por trigramas + Levenshtein; medir precisão no golden set de buscas.

## Dívida de teste (não é bug do produto)

| ID    | Teste                                                           | Problema                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001 | `comunidade.spec.ts › publica, outra pessoa confirma…` (mobile) | Localiza o cartão pelo **preço** (`R$ 3,73`); acha o cartão de uma execução anterior (`Colaborador #F071`). Precisa de preço realmente único por execução ou localizar pelo apelido. Falhou na linha de base do mobile. |
| T-002 | `contribuir.spec.ts › usuário comum não entra no painel…`       | Passa isolado; falhou uma vez em execução completa (`Target page… has been closed`): corrida.                                                                                                                           |
| T-003 | `admin-cadastro.spec.ts › produtos…`                            | Leva ~2,5 min por esperar o TTL do cache (QA-004). Some quando o cache for invalidado na escrita.                                                                                                                       |
