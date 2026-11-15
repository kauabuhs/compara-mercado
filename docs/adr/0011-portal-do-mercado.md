# ADR-0011 — Portal do mercado (lojista) e campanhas

- **Status:** Proposto (Fases 2 e 3 do plano de comunidade)
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0010](0010-comunidade-de-precos-e-confianca.md)

## Contexto

Hoje uma loja (`stores`) não tem dono: só o admin cria e edita. Supermercados querem cadastrar a loja, publicar preços e promoções e atrair clientes com campanhas. Isso precisa conviver com o dado da comunidade sem criar um segundo modelo de preço.

## Decisão

1. **Vínculo por membro, não por papel global:** tabela `store_members (store_id, user_id, role owner|staff, status pending|active|rejected, verified_by, verified_at)` e função `is_store_member(store_id)`. **Não** se cria um valor novo em `user_role`; um usuário pode ser lojista de uma loja e cliente das outras.
2. **Verificação:** o lojista solicita acesso à loja (CNPJ já é único em `stores`); o **admin aprova manualmente** em `/admin/lojistas`. Sem verificação automática por API externa no início.
3. **Preço do mercado = `price_observation` com `source = 'store_panel'`**, aprovada automaticamente (`approved_via = 'store'`) e exibida com o selo _Oficial_. A RLS só deixa o membro ativo inserir para suas lojas. Promoção = observação com `promo = true` e `valid_to`. `price_lists`, `product_prices` e `promotions` **não** são ligadas à API nesta etapa.
4. **Convivência com a comunidade:** o preço _Oficial_ aparece primeiro, mas a publicação mais recente da comunidade continua visível com seu selo.
5. **Perfil público da loja:** `store_profiles` (descrição, logo, telefone/WhatsApp, entrega) e `GET /v1/stores/:id`; página `/mercados/[id]`.
6. **Campanhas (Fase 3):** `campaigns`, `campaign_products` e `campaign_events` agregados. Toda campanha passa por **revisão do admin** antes de ir ao ar. Monetização (retail media) só depois de haver audiência.

## Consequências

- ➕ Comparador, ofertas e feed não mudam de modelo.
- ➕ Auditoria clara de quem publicou (`created_by` + `store_members`).
- ➖ Aprovação manual de lojistas não escala; aceitável para o piloto.
- ➖ Sem uso de `promotions` por enquanto: regras complexas (leve X pague Y, limites de uso) ficam para depois.
