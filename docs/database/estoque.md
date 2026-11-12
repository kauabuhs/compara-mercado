# Estoque e fornecedores

## Modelo

```text
warehouses (CD ou retaguarda de loja)
   └─< inventory (depósito, variante) : on_hand, reserved, available = on_hand − reserved, min/max
          ├─< inventory_movements   (razão imutável: kind, quantity_delta, on_hand_after, ref, idempotência)
          └─< stock_reservations    (quantidade, referência, validade, status)
suppliers ─< supplier_products >─ products   (custo, prazo, mínimo, preferencial)
```

Estoque **não é uma coluna de `products`**: é saldo por local, protegido por constraints e alterado só por funções.

| Quantidade                   | Significado                                              |
| ---------------------------- | -------------------------------------------------------- |
| **física** (`on_hand`)       | O que existe no depósito                                 |
| **reservada** (`reserved`)   | Comprometida por reservas ativas (carrinho/pedido)       |
| **disponível** (`available`) | `on_hand − reserved` (coluna gerada, sempre consistente) |

Unidade: `numeric(14,3)`. Produtos `sale_mode='per_unit'` **só aceitam inteiros** (recusado com `22023`); por peso/volume aceitam até 3 casas.

## Consistência sob concorrência

Três camadas, da mais forte para a mais conveniente:

1. **Constraints no banco**: `CHECK (on_hand >= 0)`, `CHECK (reserved >= 0)`, `CHECK (reserved <= on_hand)`. Vender o que não existe ou reservar mais que o físico é impossível, **mesmo para quem ignorar as funções**.
2. **Um único `UPDATE` condicional por operação** (`stock_apply_movement`, `reserve_stock`, `commit_reservation`…): o `UPDATE` trava a linha do item; operações concorrentes se enfileiram nela e os CHECKs avaliam o saldo já atualizado pela anterior. Nada de ler-e-depois-escrever na aplicação.
3. **Razão na mesma transação**: toda mudança grava a movimentação com `on_hand_after`. `SUM(quantity_delta) = on_hand` (testado). Movimentações são somente inclusão.

Provado com conexões paralelas reais (`commerce.integration.test.ts`):

| Cenário                                              | Resultado                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| 25 reservas simultâneas de 1 un. sobre 10 em estoque | exatamente 10 sucessos, 15 `insufficient_stock`; `reserved=10`, `available=0` |
| Confirmar as 10 reservas ao mesmo tempo              | `on_hand=0`, `reserved=0`, razão fecha em 0                                   |
| 20 saídas de 1 un. simultâneas sobre 10              | exatamente 10 sucessos; saldo nunca negativo                                  |
| 40 transferências cruzadas A⇄B simultâneas           | zero deadlock; total conservado                                               |

**Deadlocks**: `transfer_stock` aplica as duas pernas em ordem crescente de `warehouse_id`, então transferências em sentidos opostos pegam os locks na mesma ordem.

## Operações

| Função (SQL)                | Wrapper TS                    | Comportamento                                                                                                                     |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `stock_apply_movement`      | `receiveStock`, `adjustStock` | Entrada, ajuste, perda, avaria, devolução. **Idempotente** por `idempotency_key`                                                  |
| `reserve_stock`             | `reserveStock`                | Reserva só se houver disponível. Idempotente por (depósito, produto, referência) enquanto ativa; validade padrão 15 min           |
| `commit_reservation`        | `commitReservation`           | Baixa o físico e libera a reserva; gera movimentação `sale`. Idempotente. **Recusa reserva vencida** (`ST002`) mesmo antes do job |
| `release_reservation`       | `releaseReservation`          | Cancela reserva ativa; liberar de novo devolve `false`; reserva confirmada ⇒ `ST002`                                              |
| `transfer_stock`            | `transferStock`               | Duas pernas (`transfer_out`/`transfer_in`) ligadas por `transfer_id`, atômicas                                                    |
| `expire_stock_reservations` | `expireStockReservations`     | Job (cron `* * * * *`): devolve ao disponível o que venceu. Idempotente                                                           |

Erros: `ST001` ⇒ `insufficient_stock`; `ST002` ⇒ `reservation_not_active`.

**Trade-off assumido:** uma reserva vencida e ainda não varrida continua contando como reservada até o job rodar (até ~1 min) — o disponível fica momentaneamente **subestimado**, nunca superestimado. Preferimos nunca vender além do físico a ganhar um minuto de disponibilidade.

## Depósitos e lojas

`warehouses.kind`: `distribution_center` (sem loja) ou `store_stock` (exatamente uma loja; no máximo um por loja). A loja tem de pertencer ao mesmo mercado do depósito (FK composta). Estoque só existe para locais integrados à operação: lojas observadas pelo comparador não têm linhas aqui.

## Fornecedores

`suppliers` (identificador fiscal único por país quando informado; formato varia por país, por isso é texto) e `supplier_products` (custo em unidade menor + moeda, prazo, pedido mínimo, **no máximo um preferencial por produto**). O custo da entrada de mercadoria fica na movimentação (`unit_cost_minor` + `cost_currency`, ambos ou nenhum), então o custo histórico não muda quando o fornecedor reajusta.

## Fora do escopo (próximos passos)

Ordens de compra/recebimento, lotes e validade por lote (perecíveis), inventário rotativo com contagem cega e custo médio ponderado. O razão e as referências (`reference`, `supplier_id`) já comportam esses fluxos sem mudar o saldo.
