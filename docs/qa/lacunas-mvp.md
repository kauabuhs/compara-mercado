# O que falta para um MVP concluído

Atualizado em 2026-11-15. Vem do mapeamento do código, dos ADRs e do roadmap, e será confirmado ao fim do QA. Ordem: o que impede o lançamento público primeiro.

## Impede o lançamento público

| #   | Item                                                                       | Situação hoje                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Exportar e excluir conta (LGPD)                                            | Não existe (rota, serviço ou RPC). A tela mostra "Em breve" (`privacy-row.tsx`). Além disso, **excluir quem tem preço falha** (QA-001).              |
| 2   | Revisão jurídica de Termos e Privacidade + canal de contato do responsável | `TODO(revisão jurídica)` em `/termos` e `/privacidade`; o contato é "informado antes do lançamento".                                                 |
| 3   | Staging e produção                                                         | Projetos Supabase não criados; deploy automático pendente; host da API e do worker em aberto.                                                        |
| 4   | Observabilidade                                                            | Sem Sentry, monitor externo ou alertas de fila e de orçamento de IA.                                                                                 |
| 5   | Segurança de produção                                                      | Rate limit e cache só em memória por instância; sem CSP com nonce nem CAPTCHA no login; worker conecta como `postgres` (falta o papel `app_worker`). |
| 6   | Beta fechado                                                               | 2 semanas, 10 a 20 pessoas na cidade piloto, medindo adesão, aprovação e tempo de revisão; teste de usabilidade com 5 pessoas.                       |

## Produto incompleto (afeta quem usa)

| #   | Item                                                                   | Detalhe                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Catálogo real                                                          | Seed com 6 mercados e 48 produtos (o plano pede ~100). Falta importação em lote.                                                                                                                     |
| 8   | Cidade aplicada de forma desigual                                      | `/mercados` e `/comunidade` respeitam a cidade; a home, `/ofertas`, `/busca` e a lista de mercados em `/contribuir` não. Dá para enviar preço de um mercado de outra cidade.                         |
| 9   | Home                                                                   | "Mercados da cidade" não são links.                                                                                                                                                                  |
| 10  | Admin: lacunas de CRUD                                                 | Categoria não tem desativar; marca do produto não se edita; cidade só edita nome e situação; não há tela de usuários e papéis.                                                                       |
| 11  | Admin: erro de decisão sem mensagem                                    | Aprovar, rejeitar e moderar lançam `Error` genérico em falha e caem em `error.tsx`.                                                                                                                  |
| 12  | `/conta/envios`                                                        | Página além do fim mostra "Você ainda não enviou nenhum preço" (as outras listas redirecionam para a última página).                                                                                 |
| 13  | Pipeline de encartes com IA                                            | Sem upload de encarte, sem produtor da fila `process-source` (`enqueueProcessSource` ninguém chama), gasto de IA zera ao reiniciar o worker, spike com 3 encartes reais e golden set real pendentes. |
| 14  | Itens do roadmap da Fase 1                                             | Histórico por produto por mercado na tela, alerta de preço, scanner de código de barras, onboarding de 3 telas, mercados favoritos, sugestões de busca.                                              |
| 15  | Portal do mercado (`store_members`, `/loja`, selo Oficial) e campanhas | Só ADR-0011; nada implementado. Pode ficar fora do MVP.                                                                                                                                              |
| 16  | Redes e filiais (ADR-0014, fases 2 a 4)                                | Planejado; sem tabela nem rota.                                                                                                                                                                      |

## Inconsistências a corrigir

- Título do histórico do produto diz "90 dias", mas há seletor de 30 e 90.
- `docs/api.md` não cita o campo `note` de `POST /v1/admin/observations/:id/review` (só o ADR-0016).
- O papel `contributor` existe, mas nenhum fluxo o atribui.
- Preço máximo aceito varia por origem: contribuição R$ 10.000,00, admin R$ 999.999,99, IA R$ 100.000,00 (confirmar se é intencional).
- Preço antigo (`stale`) ainda entra na comparação; só é marcado.
- Bugs do QA: ver `bugs.md` (QA-001 a QA-005).
