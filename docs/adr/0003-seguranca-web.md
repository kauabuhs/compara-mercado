# ADR-0003 — Segurança da camada web

- **Status:** Aceito, com endurecimentos planejados
- **Data:** 2026-11-09

## Decisões

1. **Cabeçalhos** em `next.config.ts`: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (câmera e geolocalização só do próprio site). Testados no e2e.
2. **Sessão** por `@supabase/ssr` (cookies httpOnly). O papel do usuário é lido de `profiles` no servidor; **nunca** de metadados do cliente. Toda ação de admin confere o papel e o banco confere de novo por RLS.
3. **Entrada** validada com Zod em todas as Server Actions; erros mostram mensagem genérica ao usuário e o detalhe vai para o log.
4. **Rate limit** em memória (`lib/rate-limit.ts`) nas ações de comparação e login.
5. **Callback de login** redireciona para destino fixo (sem _open redirect_).
6. **Localização**: a distância dos mercados é calculada no aparelho; para `compare_list` a posição vai só na chamada e não é gravada.

## Limitações conhecidas e plano

| Limitação                                                                 | Risco                                         | Plano                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CSP usa `'unsafe-inline'` em scripts/estilos (Next injeta scripts inline) | XSS armazenado ficaria mais fácil de explorar | CSP com _nonce_ por requisição via `proxy.ts` antes do beta (torna páginas dinâmicas: medir LCP) |
| Rate limit é por instância                                                | em serverless, o limite efetivo é maior       | mover para tabela no Postgres ou edge antes do beta                                              |
| Login por link mágico sem CAPTCHA                                         | abuso de envio de e-mail                      | habilitar CAPTCHA do Supabase Auth e limites de e-mail no projeto                                |
| Upload de etiqueta ainda não implementado                                 | —                                             | Fase 3: rota no servidor, `sharp` para remover EXIF, checagem de magic bytes                     |
