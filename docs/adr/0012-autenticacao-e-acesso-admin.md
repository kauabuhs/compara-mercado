# ADR-0012 — Autenticação (cadastro, login, recuperação de senha) e acesso ao admin

- **Status:** Aceito
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0003](0003-seguranca-web.md) (segurança web), [ADR-0005](0005-separacao-frontend-backend.md) (o navegador só fala com o Next), [ADR-0009](0009-perfil-consentimento-e-cidade.md) (perfil, consentimento e endurecimento do Supabase Auth)

## Contexto

O acesso era só por **link mágico** na própria `/conta`: não havia cadastro com consentimento, senha, recuperação de senha nem como o admin local usar a senha do seed pela interface. O `/admin` redirecionava para `/conta` sem explicar o motivo nem lembrar o destino, e não havia procedimento para tornar alguém admin fora do seed.

## Decisão

1. **E-mail + senha como caminho principal, link de acesso como alternativa.** Telas dedicadas: `/entrar`, `/cadastro`, `/recuperar-senha`, `/nova-senha` e `/conta/perfil` (editar nome, telefone, cidade e trocar a senha). A `/conta` deixa de ter formulário: mostra só os atalhos "Entrar" e "Criar conta".
2. **A sessão continua no Next** (`createAuthClient`, cookie `httpOnly`). O PKCE exige que o mesmo servidor que iniciou o fluxo troque o código; por isso as Server Actions de `modules/auth/actions.ts` falam com o Supabase Auth e o navegador nunca o faz.
3. **Cadastro** só por `/cadastro`: nome, e-mail, senha (≥ 10, maiúscula, minúscula e número, espelhando `config.toml`) e **aceite dos Termos e da Política** (versão em `lib/legal.ts`, gravada pelo banco, ADR-0009). O link de acesso usa `shouldCreateUser: false`, para que ninguém crie conta pulando o aceite. A confirmação do e-mail é obrigatória.
4. **Sem enumeração de contas.** Cadastro, "esqueci a senha" e link de acesso respondem da mesma forma com ou sem conta; login errado diz sempre "E-mail ou senha incorretos". Só quem acertou a senha de uma conta não confirmada recebe o reenvio da confirmação.
5. **Destino pós-login (`?next=`) só por lista fixa** (`lib/safe-next.ts`): caminho interno conhecido, sem query, sem `//`, `\`, esquema ou `..`. Vale para o login, o cadastro e o callback (`/auth/callback`), que continua sem open redirect.
6. **Recuperação de senha:** `resetPasswordForEmail` com `redirectTo` fixo no nosso callback → `/nova-senha`. Trocar a senha encerra as **outras** sessões (`signOut({ scope: "others" })`). Com `secure_password_change`, trocar a senha dentro da conta exige login recente.
7. **Admin: o mesmo login, o painel por papel.** Não há login nem cadastro de admin. `/admin` manda visitante para `/entrar?next=/admin` (e volta ao painel depois) e usuário sem o papel para `/conta?aviso=sem-permissao`, com explicação. As três barreiras continuam: layout do Next, `requireAdmin` na API e RLS (`is_admin()`).
8. **Tornar alguém admin é uma operação de dados controlada**, nunca pela interface: runbook [promover-admin](../runbooks/promover-admin.md). A trigger `audit_role_change` registra a mudança.
9. **Dados mínimos** (LGPD): nome de exibição, e-mail, cidade e telefone opcionais, aceite dos termos. Não pedimos CPF, data de nascimento nem endereço: nada no serviço depende deles.
10. **Testes:** a API é testada com usuários criados já confirmados pela chave administrativa do Supabase **local** (`SUPABASE_TEST_SERVICE_ROLE_KEY`, só em `src/__tests__/support/`); o e2e lê os e-mails no Mailpit como uma pessoa leria os dela.

## Consequências

- ➕ O admin local entra pela interface com `admin@local.test` / `admin123456`; produção ganha um caminho documentado e auditável para criar admins.
- ➕ Recuperação de senha, confirmação de e-mail e link de acesso passam todos por um único callback com destino validado.
- ➖ O limitador de tentativas do Next é **por instância** (em memória); a barreira real é o rate limit do Supabase Auth, que precisa ser configurado em produção ([runbook](../runbooks/auth-producao.md)).
- ➖ Abrir o link do e-mail em **outro navegador** não troca o código (o PKCE vive no navegador que pediu). A confirmação de cadastro já foi feita pelo Supabase, então a pessoa só precisa entrar; a recuperação de senha precisa ser pedida de novo no mesmo navegador. A tela `/entrar?erro=link` explica isso.
- ➖ O texto dos Termos e da Política é inicial e **precisa de revisão jurídica** e de um canal de contato do responsável antes do lançamento público.
- ➖ Exportar e excluir a conta (LGPD) seguem pendentes (roadmap).

## Fora de escopo (por ora)

Segundo fator (TOTP) para admin, login social (Google), foto de perfil, troca de e-mail e CAPTCHA no cadastro (ligar se houver abuso; ver runbook de produção).
