# Matriz de testes — QA ponta a ponta

Atualizado em 2026-11-15. Legenda: ✅ passou · ❌ falhou (ver `bugs.md`) · 🟡 passou com ressalva · ⬜ ainda não executado · ➖ não existe no produto.

Plano completo: fases 0 a 5 do plano de QA (aprovado em 2026-11-15). Este arquivo registra o que **já foi executado**; o restante continua ⬜.

## Fase 0 — Linha de base (nenhum arquivo alterado)

| Verificação                                                                | Resultado                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm check` (lint + arch + tipos + testes)                                | ✅ 305 passando, 87 ignorados (integração sem variáveis)                   |
| Vitest do Back **com** integração (`SUPABASE_TEST_*`, `DATABASE_URL_TEST`) | ✅ 395 de 395, 0 ignorados                                                 |
| `pnpm db:test` (pgTAP)                                                     | ✅ 16 arquivos, 430 asserts (depois da Fase 3: 19 arquivos, 475)           |
| `pnpm build:back` + `pnpm build:front`                                     | ✅                                                                         |
| e2e `desktop` (62)                                                         | 🟡 58 ✅ · 2 ❌ (1 flake de corrida, 1 intermitente: QA-003) · 2 ignorados |
| e2e `mobile` (62)                                                          | 🟡 58 ✅ · 1 ❌ (T-001) · 3 ignorados                                      |
| Ambiente                                                                   | 🟡 Node 24.14.0 (QA-005)                                                   |

## Fase 3 — Bordas de banco e worker

| ID   | Caso                                                                                                                                                               | Resultado                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| B-01 | Excluir usuário que tem preço registrado                                                                                                                           | ❌ QA-001 (`17_account_deletion.test.sql`)                  |
| B-02 | Excluir usuário sem preços                                                                                                                                         | ✅                                                          |
| B-03 | `registerJobs`, filas e agendas do worker                                                                                                                          | ✅ `jobs.test.ts` (10 testes)                               |
| B-04 | `AnthropicVisionProvider` (retry de schema, PDF × imagem, erros retentáveis)                                                                                       | ✅ `anthropic.test.ts` (9 testes)                           |
| B-05 | SQL da comunidade: expiração, tetos 200 e 50 por dia, 20 pontos por dia, reputação ≥ 0, "mudou" ×2 em preço aprovado, `stores_sync_city_active`, `handle_new_user` | 🟡 QA-009 (`18_community_edges.test.sql`, 27 asserts)       |
| B-06 | Comparação: quantidade somada > 99, overflow de `total_cents`, preço antigo, produto arquivado, loja inativa                                                       | ❌ QA-006, QA-007 (`19_compare_edges.test.sql`, 13 asserts) |
| B-07 | Orçamento de IA: gasto zera ao reiniciar; modelo fora de `PRICING` não consome; erro retentável × fatal                                                            | 🟡 documentado em `pipeline.test.ts` (5 testes)             |
| B-08 | Upload: foto órfã, envio duplo, multipart malformado, 5 MB exatos                                                                                                  | ❌ QA-008 (`it.fails`)                                      |

## Fase 1.5 / 4 — Admin: CRUD do cadastro-base (`admin-cadastro.spec.ts`, desktop e mobile)

| ID   | Caso                                                                               | Desktop   | Mobile    |
| ---- | ---------------------------------------------------------------------------------- | --------- | --------- |
| A-01 | Cidades: UF e IBGE inválidos barrados no navegador                                 | ✅        | ✅        |
| A-02 | Cidades: cadastrar, formulário limpa ao salvar                                     | ✅        | ✅        |
| A-03 | Cidades: IBGE duplicado → "já existe", mantém o digitado                           | ✅        | ✅        |
| A-04 | Cidades: buscar (com e sem resultado), editar nome (UF/IBGE imutáveis)             | ✅        | ✅        |
| A-05 | Cidades: desabilitar pede confirmação; cancelar não altera                         | ✅        | ✅        |
| A-06 | Cidades: filtro Habilitadas/Desabilitadas; habilitar direto                        | ✅        | ✅        |
| A-07 | Categorias: identificador inválido barrado; cadastrar; duplicado → 409             | ✅        | ✅        |
| A-08 | Categorias: subcategoria; a própria não aparece como "pai"; editar                 | ✅        | ✅        |
| A-09 | Produtos: nome curto barrado; GTIN com dígito errado recusado; digitado preservado | ✅        | ✅        |
| A-10 | Produtos: cadastrar com GTIN válido; GTIN repetido → 409                           | ✅        | ✅        |
| A-11 | Produtos: buscar por GTIN; editar tamanho                                          | ✅        | ✅        |
| A-12 | Produtos: arquivar (confirmação) e reativar; efeito na busca pública               | 🟡 QA-004 | 🟡 QA-004 |
| A-13 | Mercados: latitude fora do intervalo recusada; vírgula decimal aceita              | ✅        | ✅        |
| A-14 | Mercados: cadastrar, editar bairro, inativar (confirmação), filtro Inativos        | ✅        | ✅        |
| A-15 | As 4 listagens respondem 200 ao admin; as 8 abas existem                           | ✅        | ✅        |

## Ainda sem execução (cobertura do plano)

| Área                                                                                               | Situação                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1.1 Acesso e conta (cadastro, login, recuperar, perfil, apelido, telefone, tema, cidade)           | ⬜ (a base já cobre o caminho feliz de cadastro, login, recuperação e perfil; faltam as validações e bordas) |
| 1.2 Busca e filtros (`/busca`, `/ofertas`, `/produto`, `/mercados`)                                | ⬜ (base cobre o caminho feliz)                                                                              |
| 1.3 Lista de compras e sincronização                                                               | ⬜ (base cobre montar, recarregar, vazio)                                                                    |
| 1.4 Comunidade e contribuição (validações, abas, votos, regra de confiança)                        | ⬜ (base cobre publicar/confirmar/denunciar/rejeitar)                                                        |
| 1.5 Admin: lançar preço, revisão (aprovar/rejeitar), moderação (4 ações)                           | ⬜                                                                                                           |
| 2 Transversal: segurança, concorrência, responsivo de todas as telas, desempenho, PWA, resiliência | ⬜                                                                                                           |
| Exploratório manual guiado no navegador                                                            | ⬜                                                                                                           |
