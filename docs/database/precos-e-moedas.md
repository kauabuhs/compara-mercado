# Preços e moedas

## Dinheiro

| Decisão                         | Detalhe                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo                            | `bigint` em **unidade menor** da moeda (`amount_minor`): 12,90 BRL = `1290`; 500 JPY = `500`; 1,250 KWD = `1250`                                                                                                                                    |
| Casas decimais                  | `currencies.minor_unit` (ISO 4217). Converter para exibição é `amount_minor / 10^minor_unit`, na apresentação                                                                                                                                       |
| Nunca `float`                   | Nenhuma coluna monetária é `real`/`double`. Taxas e percentuais são `numeric(5,2)`                                                                                                                                                                  |
| Por que inteiro e não `numeric` | É decimal **exato por construção** (não existe "meio centavo" gravável), reaproveita a convenção do projeto (`domain/money.ts`, contratos da API em centavos) e `bigint` comporta moedas de valor nominal alto (IDR, VND) que estourariam `integer` |
| Moeda                           | Vem **da lista de preço**, e a lista é presa ao mercado por FK composta `(market_id, currency_code)`. Impossível um preço em USD numa lista do mercado BRL                                                                                          |
| Câmbio                          | **Não existe no banco.** Cada mercado tem seu preço na sua moeda. Comparar entre moedas é uma funcionalidade à parte (tabela de câmbio com data), nunca derivada do preço comercial                                                                 |
| Observações (`price_cents`)     | Evidência do comparador, em BRL (centavos, `integer`). Mantidas como estão; não se misturam com preço publicado                                                                                                                                     |

### Arredondamento (regra única)

**Meio para longe do zero**, aplicado **uma vez**, no valor final da linha, em unidade menor. É o `round()` do `numeric` do Postgres (`public.money_round`) e deve ser o mesmo em TypeScript (`Math.round` em valores positivos).

- Desconto percentual: `preço − round(preço × pct / 100)`. Ex.: 12,5 % de 799 = 99,875 → desconto 100 → **699**. 10 % de 5 = 0,5 → desconto 1 → **4**.
- Nunca se arredonda em etapas intermediárias.
- Promoções empilhadas arredondam **cada uma** sobre o preço corrente (resultado documentado e testado: 1200 → 30 % → 840 → 10 % → 756).

## Listas de preço e versões

```text
price_lists ──< product_prices(price_list_id, product_id, amount_minor, valid_from, valid_to)
```

- **Escopo da lista**: `store_id` nulo = mercado inteiro; preenchido = lista exclusiva da loja. Pode haver várias por escopo; `priority` desempata.
- **Uma linha = um preço válido em `[valid_from, valid_to)`**. Mudar o preço **encerra** a versão vigente e abre outra; o histórico é a própria tabela.
- **Sem sobreposição**: `EXCLUDE USING gist (price_list_id =, product_id =, tstzrange(valid_from, valid_to,'[)') &&)`. Dois preços para o mesmo produto/lista no mesmo instante são impossíveis, mesmo com escritas concorrentes.
- **Imutável**: valor, lista, produto e início não mudam (`42501`); só se pode encerrar (`valid_to`). Sem `DELETE`.
- **Mudar preço**: `set_product_price(lista, produto, valor, a_partir_de)` — serializa por (lista, produto) com advisory lock, fecha a versão que cobre o instante e cria a nova, que termina onde começa a próxima já agendada. **Preço agendado** é só passar uma data futura. Em TypeScript: `setProductPrice`.

## Resolução de preço (`resolve_prices`)

`resolve_prices(loja, produtos[], em, quantidade)` devolve, por produto: moeda, preço de lista, lista usada, **preço final**, desconto, promoções aplicadas e `valid_until`.

1. **Preço de lista**: listas **ativas** do mercado da loja com preço vigente no instante. Vence a lista **exclusiva da loja**, depois maior `priority`, depois a versão mais recente.
2. **Sem preço publicado** ⇒ o produto **não aparece** no resultado (nunca inventa preço).
3. **Promoções**: ver [promocoes.md](promocoes.md). Uma promoção nunca eleva o preço; o resultado nunca é negativo.
4. `valid_until` = o instante mais próximo em que os dados usados deixam de valer (fim do preço ou da promoção). Serve para limitar o TTL de cache, **mas** um cache também precisa de TTL máximo (uma promoção futura pode começar antes).

É `SECURITY DEFINER` e o público a executa, sem poder ler as tabelas de preço/promoção. Aceita até 200 produtos e quantidade 1–9999.

**Performance** (200 mil produtos, 400 mil versões): ~0,8 ms por produto, 40 ms para 50 produtos (plano em cache). O cálculo roda por produto em PL/pgSQL; para carrinhos muito grandes ou milhões de resoluções por segundo, a evolução é materializar o preço efetivo (tabela derivada recalculada em mudanças de preço/promoção) — só com medição que peça.

## Mercados, fuso e calendário local

- Tudo é gravado em **UTC** (`timestamptz`).
- Quem cadastra uma data **local** ("promoção termina às 23:59 de domingo em Lisboa") converte com `market_local_to_utc(mercado, timestamp_local)` — usa o fuso IANA do mercado, inclusive horário de verão. A exibição converte de volta.
- `markets.prices_include_tax` registra a convenção do país (preço com ou sem imposto). **Não há motor de impostos**: se for necessário, é um módulo próprio, não colunas em `product_prices`.

## Moeda de um mercado é imutável

Trocar a moeda reinterpretaria todos os preços gravados; o gatilho recusa (`42501`). Mudou a moeda do país? Crie outro mercado e outra lista, preservando o histórico.
