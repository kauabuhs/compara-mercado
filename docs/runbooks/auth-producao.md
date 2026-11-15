# Runbook — Supabase Auth em produção (e-mail, senha e redirecionamentos)

O `ComparaMercado-Back/supabase/config.toml` configura só o Supabase **local**. Em staging e produção o Auth é configurado no painel do Supabase (Authentication) e **não herda** nada do arquivo: confira cada item abaixo antes do primeiro usuário real. Contexto: [ADR-0009](../adr/0009-perfil-consentimento-e-cidade.md) e [ADR-0012](../adr/0012-autenticacao-e-acesso-admin.md).

## Checklist

| Onde (Authentication →)     | Ajuste                                                                                                                         | Por quê                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| URL Configuration           | **Site URL** = domínio de produção (`https://...`). **Redirect URLs**: `https://<domínio>/auth/callback`                       | links de confirmação e recuperação voltam para o callback; fora da lista o Supabase usa o Site URL |
| Providers → Email           | **Confirm email** ligado; **Secure password change** ligado                                                                    | cadastro só vale com e-mail confirmado; trocar a senha exige login recente                         |
| Providers → Email           | Tamanho mínimo da senha **10** e exigir minúscula, maiúscula e dígito                                                          | espelha `lib/password.ts` (o front mostra a regra; quem recusa é o Supabase)                       |
| Password protection         | Bloquear senhas vazadas (HaveIBeenPwned), se o plano permitir                                                                  | impede senhas já expostas em vazamentos                                                            |
| SMTP Settings               | **SMTP próprio** (Resend, SES, Postmark…) com remetente do domínio, SPF, DKIM e DMARC configurados                             | o SMTP padrão do Supabase é limitado e não serve para produção; e-mail no spam = ninguém entra     |
| Email Templates             | Cole o HTML de `ComparaMercado-Back/supabase/templates/{confirmation,recovery,magic_link}.html` e os assuntos de `config.toml` | o painel não lê os arquivos do repositório                                                         |
| Rate Limits                 | Revise e-mails por hora, tentativas de login e verificações por IP                                                             | é a barreira real contra força bruta e envio em massa (o limite do Next é por instância)           |
| Attack Protection (CAPTCHA) | Ligar Turnstile/hCaptcha **se** houver abuso de cadastro; exige também o widget nas telas `/cadastro` e `/recuperar-senha`     | não está implementado: só ligue junto com a mudança no front                                       |
| Sessions                    | Tempo de vida do JWT 1 h (padrão); rotação de refresh token ligada                                                             | mesma configuração do local                                                                        |

## Variáveis de ambiente do Front

- `NEXT_PUBLIC_SITE_URL` = o mesmo domínio do Site URL (usado para montar os links dos e-mails).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` do projeto de produção. **Nunca** coloque `service_role` no Front.

## Teste de fumaça depois de configurar

1. Criar conta em `/cadastro` com um e-mail seu → o e-mail chega (fora do spam), em pt-BR, com o botão certo.
2. Abrir o link no mesmo navegador → cai em `/conta` já logado, com o nome informado.
3. Sair, "Esqueci a senha" → e-mail chega → `/nova-senha` → entrar com a senha nova.
4. Tentar `/admin` com essa conta → volta para `/conta` com o aviso de falta de permissão.
5. Promover a conta com o [runbook](promover-admin.md) e repetir o passo 4 → o painel abre.
6. Trocar a **senha do admin do seed** não se aplica (ele só existe no local), mas confirme que **não há** usuário `admin@local.test` em produção.
