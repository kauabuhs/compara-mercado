# ADR-0010 — Comunidade de preços e confiança por corroboração

- **Status:** Aceito (Fase 1 implementada: banco, API e telas; ver o plano em `docs/roadmap.md`)
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0008](0008-contribuicao-de-precos-com-foto.md) (que adiou feed, corroboração e ranking), [ADR-0009](0009-perfil-consentimento-e-cidade.md), [ADR-0011](0011-portal-do-mercado.md)

## Contexto

O ADR-0008 validou o envio de preço com foto, mas deixou tudo em revisão humana e **invisível para as outras pessoas**. O produto agora precisa de uma comunidade: ver o que a cidade publicou, confirmar, denunciar e ganhar reputação. Revisão manual de cada preço não escala nem é "tempo real".

## Decisão

1. **Uma única fonte de verdade:** todo preço continua sendo uma `price_observation` (imutável). Comunidade e mercado só mudam quem cria e como ela é aprovada; `current_prices`, `compare_list` e `list_offers_page` seguem sem reescrita.
2. **Corroboração:** uma observação `pending` vira `approved` quando recebe **≥ 2 confirmações de usuários distintos do autor** sem contestação pendente, **ou** quando o autor tem nível _Confiável_ ou superior. A transição é feita por funções `SECURITY DEFINER` (`confirm_observation`, `evaluate_observation`), registrada em `approved_via` (`community` ou `trusted_author`), sem preencher `approved_by`/`reviewed_by`. As tabelas de confirmação e denúncia não aceitam escrita direta de `authenticated`: nem um cliente que fale com o PostgREST pula as regras.
3. **Contestação:** ≥ 2 vereditos "mudou" ou ≥ 3 denúncias distintas tiram a publicação do feed e abrem `review_task` para o admin. Preço fora da faixa de sanidade (`ingest/service/validate.ts`) nunca é auto-confirmado.
4. **Reputação:** níveis Novato 0 · Colaborador 50 · Confiável 200 · Guardião 600 (regra pura em `lib/reputation.ts`). Pontos: +10 preço confirmado, +2 por confirmação recebida, +1 por confirmar, −20 por preço rejeitado ou contestado. O livro-razão é a tabela `reputation_events` (só inclusão, um evento por pessoa e publicação); `contributions` não serve porque tem `unique (observation_id)` e `points >= 0`. A reputação em `profiles` só muda por dentro desse gatilho.
5. **Privacidade:** o feed expõe apelido e nível, nunca e-mail, telefone ou `user_id`. Padrão "Colaborador #1234"; apelido próprio é opcional. A foto é servida por proxy no Next (como `/admin/foto`), sem URL pública do Storage, e só para quem está logado: uma política de Storage libera a foto de publicações que o feed mostraria (`can_view_community_photo`); visitantes veem a publicação sem a foto. Os EXIF/GPS já são removidos (ADR-0008).
6. **Tempo real:** feed por recência com paginação por cursor (`created_at, id`), cache curto (15 s) e atualização ao abrir/puxar. **Sem Realtime/SSE na v1**: o stack local o desliga e o cache da API é por instância.
7. **Antiabuso:** teto diário (30) e dedup por hash (já existem); 30 confirmações/min por usuário; ninguém confirma a própria publicação; no máximo uma confirmação de nível _Novato_ conta por preço.

## Consequências

- ➕ O feed é útil mesmo sem moderador; o admin só trata exceções.
- ➕ O comparador passa a usar dado novo sem mudança no modelo.
- ➖ Há uma janela em que um preço falso aparece como "aguardando confirmação"; ela é sinalizada na interface e excluída do comparador até virar _Confirmado_.
- ➖ Conluio de contas (autor + 2 amigos) é possível; mitigado por teto diário, nível mínimo e revisão de padrões pelo admin. Antifraude avançado (hash perceptual, geofence) segue fora.
- ✔️ Os textos de privacidade (`/conta`, `/privacidade`), os termos e as telas de envio já dizem que o preço aparece na Comunidade como "não confirmado" (revisão jurídica ainda pendente).

## Endurecimento antes do beta (2026-11-15)

Achados da revisão da diff, todos resolvidos no banco (valem para quem fala direto com o PostgREST):

- **Campos de decisão no INSERT:** `price_observations_before_insert` zera `approved_via`, `review_note` e `reviewed_*` e força `created_at = now()` para quem não é admin (antes, um usuário podia forjá-los e furar o teto diário).
- **Apelido público:** único sem diferenciar maiúsculas e sem nomes reservados (equipe, admin, moderação, colaborador…); a API responde `409 nickname_unavailable`.
- **Foto:** `can_view_community_photo` usa a mesma janela e as mesmas condições do feed (7 dias, vigente, loja e produto ativos, não contestada); cache `private, max-age=60`. `public_author_label` deixou de ser executável por `anon`/`authenticated`. Limitação conhecida: o caminho do arquivo no Storage (`{user_id}/{uuid}.jpg`) ainda é devolvido a quem está logado por `community_photo_path`, o que permite ligar fotos do mesmo autor entre si (pseudônimo estável), sem revelar nome, e-mail ou telefone.
- **`current_prices`:** o gatilho de status é por comando (um refresh para N linhas).
- **Feed:** `limit` máximo 49 (o serviço pede `limit + 1` e a função SQL devolve até 50); rate limit de 120/min por IP quando a resposta não vem do cache.
