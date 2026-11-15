# ADR-0009 — Perfil da conta, consentimento e cidade preferida

- **Status:** Aceito
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0003](0003-seguranca-web.md) (segurança web), [ADR-0008](0008-contribuicao-de-precos-com-foto.md) (contribuição com foto)

## Contexto

`profiles` guardava só `display_name`, `role` e `reputation`. Para aceitar contribuições de pessoas reais (e, depois, mostrá-las a outras) o produto precisa de: **consentimento registrado** (LGPD), **cidade preferida** (o app é por cidade) e um contato opcional. Ao mesmo tempo, o cadastro não pode ser um caminho para auto-promoção de papel ou de reputação.

## Decisão

1. **Colunas novas em `profiles`:** `phone` (E.164, opcional), `city_id` (FK `cities`, `on delete set null`), `terms_accepted_at`, `terms_version` (`AAAA-MM[-DD]`) e `updated_at` (gatilho).
2. **O usuário só edita `display_name`, `phone` e `city_id`** (`grant update` por coluna). `role`, `reputation` e `terms_*` ficam fora do alcance; `profiles_guard` bloqueia a auto-promoção.
3. **O aceite dos termos vem dos metadados do cadastro** e é gravado por `handle_new_user` (SECURITY DEFINER) com validação de formato. O papel criado é **sempre** `user`, nunca lido de metadados.
4. **API:** `GET`/`PATCH /v1/me/profile` e `GET /v1/cities` (cidades com `active = true`). O `PATCH` invalida o cache de sessão (`authenticator.forget()`). O telefone é normalizado em `lib/phone.ts` (assume DDI 55).
5. **Cadastro endurecido (Supabase Auth):** confirmação de e-mail obrigatória, senha ≥ 10 caracteres com maiúscula, minúscula e dígito, `secure_password_change`; e-mails em pt-BR (`supabase/templates/`).

## Consequências

- ➕ O aceite dos termos tem data e versão; mudar os termos exige nova versão e novo aceite.
- ➕ A cidade preferida vira o filtro padrão do app (ver ADR-0010).
- ➖ Visitantes sem conta guardam a cidade só em cookie (sem persistência entre dispositivos).
- ➖ Exportar/excluir conta (LGPD) continua pendente e é pré-requisito do lançamento público.
