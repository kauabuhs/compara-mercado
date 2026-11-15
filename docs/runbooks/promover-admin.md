# Runbook — promover (ou rebaixar) um administrador

Não existe tela, rota nem cadastro que crie admin: o papel só muda no banco, por quem tem acesso a ele. A trigger `profiles_guard` impede que um usuário se promova (ou promova alguém) pelo app; a trigger `audit_role_change` grava cada mudança em `audit_log`.

> Isto é uma **operação de dados**, não uma alteração de schema: a regra "nada manual em produção" (ver [migrações](migracoes.md)) vale para o schema. Registre cada promoção no ticket ou PR de quem pediu, porque no SQL editor o `actor` da auditoria fica vazio.

## Antes

1. A pessoa precisa **ter criado a conta** em `/cadastro` e **confirmado o e-mail**. Não crie usuário à mão.
2. Confirme a identidade por outro canal (quem pede é quem diz ser).
3. Conceda o mínimo: admin vê a fila de revisão, as fotos das etiquetas e lança preços.

## Promover

No SQL editor do Supabase (produção/staging) ou `psql` (local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`):

```sql
-- 1) é a pessoa certa, com e-mail confirmado?
select u.id, u.email, u.email_confirmed_at, p.role
from auth.users u
join public.profiles p on p.id = u.id
where u.email = 'pessoa@exemplo.com';

-- 2) promover (só funciona com e-mail confirmado)
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users
  where email = 'pessoa@exemplo.com' and email_confirmed_at is not null
);
-- esperado: UPDATE 1

-- 3) conferir a auditoria
select at, entity_id, diff
from public.audit_log
where action = 'ROLE_CHANGE'
order by at desc
limit 5;
```

A pessoa passa a ver **Conta → Painel interno** (`/admin`) na próxima validação da sessão (até 30 s, o cache do autenticador). A RLS já vale na hora.

## Rebaixar

```sql
update public.profiles
set role = 'user'
where id = (select id from auth.users where email = 'pessoa@exemplo.com');
```

O acesso às telas de admin some em até 30 s; no banco, `is_admin()` já passa a negar imediatamente. Se o motivo for comprometimento da conta, **encerre também as sessões**: em Authentication → Users, abra o usuário e use "Sign out" (ou troque a senha dele pelo fluxo de recuperação).

## Admin do seed

`admin@local.test` / `admin123456` existe **só no Supabase local** (`seed.sql` nunca roda em staging/produção). Se por engano um usuário com esse e-mail aparecer fora do local, apague-o e investigue.

## Quando algo dá errado

| Sintoma                                  | Causa provável                                   | O que fazer                                                                |
| ---------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `UPDATE 0`                               | e-mail digitado errado ou ainda não confirmado   | repita o passo 1; peça para a pessoa confirmar o e-mail                    |
| "apenas admin altera papel ou reputação" | o SQL rodou com a identidade de um usuário comum | rode como `postgres` (SQL editor / `psql`), não por `anon`/`authenticated` |
| Pessoa promovida não vê o painel         | sessão em cache (até 30 s) ou cookie antigo      | aguarde, recarregue `/conta`; se persistir, saia e entre de novo           |
