# ADR-0016 — Moderação de preços: retirar o que já foi publicado e explicar a rejeição

- **Status:** Aceito (implementado: banco, API, painel e testes)
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0010](0010-comunidade-de-precos-e-confianca.md) (comunidade e denúncias), [ADR-0013](0013-cadastro-base-pelo-painel-admin.md)

## Contexto

A comunidade pode denunciar um preço **já aprovado** (a tarefa "Denunciada pela comunidade" nasce também para ele), mas o admin só conseguia decidir preços `pending`. Além disso:

1. nada atualizava `current_prices` quando uma observação deixava de estar aprovada;
2. as tarefas de revisão só eram encerradas quando a decisão vinha de `pending`;
3. quem enviava um preço rejeitado via apenas "Não aprovado", sem saber o motivo.

## Decisão

1. **Retirar é rejeitar.** Um preço aprovado passa a `rejected` (a observação continua imutável e guardada). Quem retirou fica em `reviewed_by`/`reviewed_at`, mesmo que a aprovação tenha sido da comunidade.
2. **O banco mantém tudo consistente** (`20261114000005_moderation.sql`), vindo a decisão da API, do worker ou de SQL:
   - `current_prices` é atualizada na mesma transação quando o status passa **para** ou **de** `approved`;
   - qualquer mudança de status encerra as tarefas de revisão abertas do preço;
   - a rejeição ganha `price_observations.review_note` (3 a 200 caracteres), visível só ao autor e ao admin (RLS de leitura já existente).
3. **Fila de moderação** (`GET /v1/admin/moderation`): tarefas abertas sobre preços, com produto, mercado, foto, situação atual e o resumo das denúncias (por motivo) e dos "mudou". A decisão é `POST /v1/admin/moderation/:taskId` com `approve` (só preço pendente), `reject` (pendente ou publicado, com motivo opcional) ou `keep` (mantém o preço e encerra a tarefa como `dismissed`).
4. **Motivo da rejeição** escolhido de uma lista pronta (`modules/admin/rejection-reasons.ts`) na fila de revisão e na moderação, e mostrado em "Meus envios".
5. **Reputação:** a retirada reaproveita a regra existente (−20 por preço rejeitado, com piso em zero), sem regra nova.
6. Contrato aditivo (3.5.0): `ModerationItem`, `ModerationDecisionRequest`, `note` em `ReviewObservationRequest`, `reviewNote` em `MyContribution` e `openModerationTasks` no resumo do admin.

## Consequências

- ➕ O admin corrige um preço publicado errado sem SQL, e o comparador reflete na hora, sem o worker.
- ➕ Quem enviou aprende o motivo da rejeição.
- ➖ Cada mudança de/para `approved` faz um refresh completo e concorrente de `current_prices` (aceitável no beta; se o volume crescer, trocar por atualização incremental ou refresh agrupado).
- ➖ Só tarefas sobre **preços** aparecem. As de alias de produto (`product_alias`) nascem do pipeline de encartes, que ainda não tem entrada de dados; ganham tela quando houver.
- ➖ Uma tarefa de preço que já foi decidido por outra via é encerrada sem mudar nada (a API devolve 404 se ela já estava encerrada).
