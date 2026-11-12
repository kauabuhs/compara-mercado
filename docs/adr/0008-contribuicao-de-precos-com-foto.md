# ADR-0008 — Contribuição de preços com foto (MVP)

- **Status:** Aceito (MVP, para validar com um beta fechado)
- **Data:** 2026-11-12
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0003](0003-seguranca-web.md) (segurança web), [ADR-0005](0005-separacao-frontend-backend.md) (o navegador só fala com o Next)

## Contexto

`/contribuir` era um placeholder. O banco já aceitava observações de preço de usuário comum (`label_photo`, `pending`, teto de 30/dia, observações imutáveis), mas não havia onde guardar a foto: o bucket `catalog` é público e só o `service_role` escreve, e a API não usa `service_role`. A pergunta que o MVP precisa responder é **"as pessoas enviam preços com foto e a qualidade serve?"** — o resto (moderador, comunidade, tempo real, leitura por IA, publicação automática) só vale depois dessa resposta.

## Decisão

1. **Foto obrigatória**, imposta na barreira final: a política `price_obs_insert` só aceita de usuário comum uma observação `pending`/`label_photo` com `source_id` apontando para uma fonte **dele**, de mercado e produto **ativos**. O admin continua lançando preço manual sem foto.
2. **Armazenamento privado e sem `service_role`:** bucket `contributions` (JPEG, 5 MB), caminho `{user_id}/{uuid}.jpg`. O dono só **insere** e **lê** na própria pasta; não há `UPDATE` nem `DELETE` (o comprovante não é trocado nem apagado depois do envio); o admin lê tudo. A API grava como o próprio usuário.
3. **O navegador só fala com o Next:** a foto é comprimida no navegador, sobe por Server Action (`serverActions.bodySizeLimit = 6mb`) e segue para `POST /v1/contributions`. O admin vê a foto por `/admin/foto/:id` (route handler que repassa os bytes da API), nunca por URL do Supabase.
4. **A API não confia no navegador:** `sanitizeJpeg` (TypeScript puro, sem dependência nativa) confere bytes mágicos e estrutura, **descarta todos os metadados** (EXIF/GPS, XMP, ICC, comentários) e qualquer coisa depois do fim da imagem, e limita dimensões (300 px de lado menor até 8000 px). Escolhemos não usar `sharp`: a API é um único `index.js` empacotado, sem `node_modules` no runtime, e o ADR-0002 pede poucas dependências nativas. **Limite conhecido:** a imagem não é decodificada, então pixels corrompidos em um JPEG estruturalmente válido passam — quem vê é o revisor.
5. **Tudo vai para revisão humana (admin).** O envio nasce `pending`, com `confidence = 0` ("não avaliado": o preço foi digitado, não lido por IA). Nada publica sozinho.
6. **Antiabuso do MVP:** teto diário (30) no banco e na API (antes de gravar arquivo), 6 envios/min por **usuário** (não por IP), `sha256` único (a mesma foto não vale duas vezes, nem de outro usuário), retomada idempotente se um envio parar no meio.

## Consequências

- ➕ Um revisor decide em segundos com a foto ao lado do dado; o autor acompanha em `/conta/envios`.
- ➕ A foto nunca é pública; RLS e políticas do bucket são a barreira (testadas em pgTAP e na integração com Storage real).
- ➖ Revisão 100 % manual: não escala. Se o beta mostrar volume, o próximo passo é a leitura por IA e a publicação automática por regra de confiança (`PUBLISH_CONFIDENCE_THRESHOLD`), não o contrário.
- ➖ Sem motivo de rejeição para o autor (o modelo só guarda o status).
- ➖ Fotos de envios duplicados entre usuários podem deixar objeto órfão na pasta de quem tentou (sem `DELETE`); limpeza por rotina de retenção, a definir.
- ➖ O consentimento ("só a etiqueta, sem pessoas") é uma caixa obrigatória no formulário, **sem registro** do aceite. Exportar/excluir conta (LGPD) segue pendente e é obrigatório antes de abrir ao público.

## Fora do MVP (só se o beta validar)

Papel de moderador, feed de comunidade, tempo real (SSE), leitura da etiqueta por IA, publicação automática, corroboração entre usuários, denúncias, ranking e antifraude avançado (hash perceptual, geofence).
