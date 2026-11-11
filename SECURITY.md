# Política de segurança

## Reportar uma vulnerabilidade

Não abra issue pública. Envie os detalhes por e-mail privado ao responsável do projeto (defina o contato antes do beta — **pendente**) ou use _GitHub → Security → Report a vulnerability_. Responderemos em até 3 dias úteis.

## Modelo de ameaças (resumo)

| Ameaça                             | Controle                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Leitura/escrita indevida de dados  | RLS em todas as tabelas; `GRANT` mínimo; papéis no banco; testes pgTAP                                                                    |
| Preço fraudulento por contribuição | contribuição nasce `pending`; limite diário; reputação; outliers vão à revisão; observação imutável                                       |
| Vazamento da `service_role`        | só em servidor/worker; `createServiceClient` recusa rodar no navegador; segredos fora do repositório; gitleaks no CI                      |
| Upload malicioso                   | buckets privados, sem política de cliente; upload só pelo servidor com validação de tipo/tamanho e remoção de EXIF                        |
| Injeção                            | consultas parametrizadas (PostgREST/RPC); Zod em toda entrada; nenhuma montagem de SQL por texto; `textContent` em popups do mapa         |
| Prompt injection via encarte       | arquivo tratado como dado no prompt; saída validada por schema; nada é executado a partir da saída; publicação só por regras de confiança |
| XSS / clickjacking                 | CSP restritiva, `frame-ancestors 'none'`, `X-Content-Type-Options`, HSTS, `Referrer-Policy`                                               |
| Cadeia de suprimentos              | `minimumReleaseAge`, `blockExoticSubdeps`, `trustPolicy`, lockfile congelado, auditoria + Semgrep + Dependabot                            |
| Abuso/DoS                          | rate limit por IP/usuário nas ações; teto mensal de gasto com IA                                                                          |

## LGPD

Dados mínimos (e-mail para login + apelido). **CPF nunca é gravado** (descartado se vier em nota fiscal). Localização exata não é guardada (usada só na consulta). Exportação/exclusão de conta: Fase 4. Prazo de retenção de imagens brutas: 90 dias (a validar). Política de privacidade e revisão jurídica antes do beta público.
