# Promoções

## Princípio: vigência é calculada, não armazenada

`promotions.status` é o ciclo de vida **editorial** (`draft → active ⇄ paused → expired | cancelled`). Se a promoção **vale agora** é sempre:

```sql
promotion_is_live(status, starts_at, ends_at, now())
  = status = 'active' AND starts_at <= now AND (ends_at IS NULL OR now < ends_at)
```

Intervalo **semiaberto `[início, fim)`** em UTC: no instante do início já vale; no instante do término já não vale. Toda consulta de preço, listagem e resgate usa essa função — **uma oferta vencida deixa de valer no segundo em que vence, mesmo que o job de expiração esteja parado**. Há teste exatamente para isso (promoção vencida e ainda `active` é ignorada).

## Condições para uma promoção ser aplicada

| Condição                          | Onde é garantida                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Ativa                             | `status = 'active'`                                                                        |
| Já começou / ainda não terminou   | `promotion_is_live`                                                                        |
| Disponível no mercado (e na loja) | `promotion_scopes` (mercado; `store_id` opcional); moeda da promoção = moeda do mercado    |
| Produto elegível                  | `promotion_products` **ou** alvo `target_brand` / `target_category` (inclui subcategorias) |
| Quantidade mínima                 | regra `min_quantity` ≤ quantidade pedida                                                   |
| Dentro do limite de uso           | `usage_count < usage_limit_total` (e por cliente no resgate)                               |

## Tipos

| `kind`         | Campos                                                               |           Resolvido em `resolve_prices`           |
| -------------- | -------------------------------------------------------------------- | :-----------------------------------------------: |
| `percent_off`  | `discount_percent`                                                   |                         ✔                         |
| `amount_off`   | `discount_amount_minor` + `currency_code`                            |                         ✔                         |
| `fixed_price`  | `fixed_price_minor` + `currency_code`                                |                         ✔                         |
| `bundle_price` | `fixed_price_minor` (total do combo) + `promotion_products.quantity` | modelo pronto; avaliação no **motor de carrinho** |
| `buy_x_pay_y`  | `buy_quantity` > `pay_quantity`                                      |       modelo pronto; **motor de carrinho**        |

Um CHECK exige exatamente os campos de cada tipo. Promoções com regra `min_spend` (gasto mínimo) também dependem do carrinho inteiro. **Pendência registrada:** o motor de carrinho (combos, "leve X pague Y", gasto mínimo) é o próximo passo; o banco já guarda tudo de que ele precisa.

## Ciclo de vida e imutabilidade

- Nasce **sempre** como `draft` (inserir já `active` é recusado). No rascunho se configuram escopo, produtos e regras.
- `draft → active` exige ≥ 1 escopo e ≥ 1 produto ou alvo (categoria/marca).
- Transições válidas: `draft→active|cancelled`, `active⇄paused`, `active|paused→expired|cancelled`. `expired` e `cancelled` são finais.
- **Ao sair do rascunho, o desconto não muda mais** (tipo, valores, início, acumulável) e escopo/produtos/regras ficam congelados (`42501`). Para alterar: cancele e crie outra. Só podem mudar: nome, descrição, status, `ends_at`, prioridade e limites.
- **Nunca é apagada** (`DELETE` ⇒ `42501`): fica para auditoria e relatórios.

## Expiração automática

Complementa a vigência calculada para que o **status** reflita a realidade (painéis, relatórios):

- **Mecanismo**: worker + pg-boss, fila `expire-promotions`, cron `*/5 * * * *` (`ComparaMercado-Back/src/jobs/index.ts`).
- **Ação**: `expire_promotions(now)` — `UPDATE … SET status='expired', expired_at=now WHERE status IN ('active','paused') AND ends_at <= now`.
- **Idempotente**: rodar 0, 1 ou N vezes dá o mesmo estado (a 2ª execução devolve 0).
- **Registro de execução**: `trackedJob` grava em `job_runs` (início, fim, `affected`, erro). A chave `pgboss:<id do job>` evita duplicar registro em reexecução.
- **Falha**: o erro é gravado (`status='failed'`, mensagem truncada em 500 caracteres, sem payload) e **relançado**, para o pg-boss decidir a nova tentativa conforme a política da fila (os jobs de manutenção usam a política padrão; ajuste `retryLimit`/`retryBackoff` na criação da fila se precisar).
- **Histórico**: a linha permanece. Relatório de ofertas encerradas = `WHERE status='expired'`.

## Empilhamento e períodos conflitantes

Promoções sobrepostas são **permitidas**, mas a resolução é **determinística** — nunca produz preço ambíguo:

1. Entre as **não acumuláveis** aplica-se **uma**: a que dá o **menor preço** (empate: maior `priority`, depois `id`).
2. Em seguida, as **acumuláveis**, em ordem de `priority`, cada uma sobre o preço corrente.
3. Nunca eleva o preço; mínimo 0; arredondamento em [precos-e-moedas.md](precos-e-moedas.md).

Antes de ativar, o admin consulta `promotion_conflicts(id)` (outras promoções não acumuláveis, ativas/pausadas/rascunho, que se sobrepõem no mesmo produto, mercado e período). Cobre produtos listados explicitamente; alvos por marca/categoria ainda não entram no relatório (limitação conhecida).

## Limites de uso

`redeem_promotion(promoção, pedido, loja, cliente?, desconto)`:

- **Idempotente** por `(promoção, pedido)`: repetir devolve o mesmo resgate sem consumir o limite.
- **Teto total atômico**: um `UPDATE … WHERE vigente AND usage_count < usage_limit_total` — valida vigência e reserva a vaga no mesmo comando. Teste de concorrência: 20 resgates simultâneos com teto 5 ⇒ exatamente 5. Um `CHECK (usage_count <= usage_limit_total)` vale mesmo se alguém contornar a função.
- **Por cliente**: serializado por advisory lock `(promoção, cliente)` para não furar o limite em paralelo. Promoção com limite por cliente exige cliente identificado.
- `usage_count` só muda por essa função (o admin não tem `UPDATE` na coluna).

| Erro    | Quando                                             | `DomainError.code`         |
| ------- | -------------------------------------------------- | -------------------------- |
| `PR001` | fora da vigência, inativa, inexistente ou esgotada | `promotion_unavailable`    |
| `PR002` | limite por cliente                                 | `promotion_customer_limit` |
| `PR003` | não vale nesta loja                                | `promotion_out_of_scope`   |

## Listagem pública

`list_live_promotions(loja, limite)` devolve só o que o público pode ver (nome, tipo, valores, vigência, produtos), apenas promoções vigentes, no escopo da loja e com saldo de uso. Esconde contadores, limites e regras internas.
