# Importação de catálogo

Catálogo real **não** entra por seed (seed = dados fictícios de desenvolvimento). Entra por importação, e este projeto **não inventa integrações**: nenhum fornecedor ou base externa está conectado. O que existe é o caminho técnico pronto para quando houver uma fonte.

## API pronta: `importCatalog`

`importCatalog(db, linhas)` em `ComparaMercado-Back/src/modules/catalog/repository/catalog-import.repository.ts`; uso típico em um job do worker (ou script operacional).

```ts
import { createOrmDb, createPool } from "./database/client";
import { importCatalog } from "./modules/catalog/repository/catalog-import.repository";

const db = createOrmDb(
  createPool(process.env.DATABASE_URL!, { applicationName: "catalog-import" }),
);
const resultado = await importCatalog(db, [
  {
    gtin: "7891000100103",
    name: "Leite integral",
    brand: "Marca X",
    categorySlug: "laticinios",
    sizeValue: 1,
    sizeUnit: "l",
    variantLabel: "Caixa 1 L",
  },
]);
// { inserted, updated, unchanged, rejected: [{ index, gtin, reason }] }
```

| Propriedade                     | Como                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Chave                           | **GTIN** com dígito verificador válido (`ComparaMercado-Back/src/lib/gtin.ts`); GTIN inválido ⇒ linha recusada                             |
| Em lote                         | Lotes de 1000, **uma transação**; novas por `INSERT` em lote, existentes por `UPDATE … FROM unnest(…)`                                     |
| Idempotente                     | Reimportar o mesmo arquivo ⇒ `unchanged`; só atualiza linhas que realmente mudam                                                           |
| Família/marca                   | Resolvidas pelo gatilho: variantes do mesmo nome+marca+categoria dividem uma família                                                       |
| Não destrutivo                  | Não apaga; marca e categoria de variantes **existentes** não mudam por importação (pertencem à família)                                    |
| Recusa explícita                | Categoria desconhecida, tamanho/unidade inválidos, duplicata na lista (vale a última) — com índice e motivo                                |
| Por que insert/update separados | O gatilho de família roda **antes** do `ON CONFLICT`; um upsert cego criaria famílias órfãs ao reimportar um GTIN com nome novo (há teste) |

## O que um adaptador de fonte precisa fazer

1. Ler a fonte (arquivo, API, EDI) e **mapear para `CatalogImportRow`** — esta é a única parte específica da fonte.
2. Chamar `importCatalog` e **registrar** o resultado em `job_runs` (`trackedJob`).
3. Revisar o `rejected` (fila de revisão humana, como no pipeline de preços).
4. Preço e estoque **não** entram por aqui: usam `setProductPrice` / `receiveStock` (outras fontes, outras responsabilidades).

## Evolução

- Importações acima de ~100 mil linhas: carregar numa tabela de staging com `COPY` e aplicar com `INSERT … SELECT` / `UPDATE … FROM` (mesma semântica).
- Atributos, alergênicos e nutrição: tabelas já existem (`family_*`); falta definir o mapeamento por fonte.
- Imagens: registrar `media_assets` + enfileirar o worker de renditions ([midias.md](midias.md)).
- Origem do dado: se várias fontes disputarem o mesmo GTIN, acrescentar `source`/`source_ref` e uma regra de precedência (hoje: primeira escrita vence nos campos da família).
