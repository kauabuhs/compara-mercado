# ADR-0014 — Biblioteca de cidades, redes de supermercados e sugestão de filiais

- **Status:** Aceito (Fase 1 — biblioteca e busca — implementada; Fases 2–4 — redes, sugestão de filial e confirmação pela comunidade — planejadas)
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0009](0009-perfil-consentimento-e-cidade.md) (cidade preferida), [ADR-0010](0010-comunidade-de-precos-e-confianca.md) (regra de confiança), [ADR-0013](0013-cadastro-base-pelo-painel-admin.md) (cadastro-base)

## Contexto

Só o admin cadastrava cidades, e o seletor listava apenas as habilitadas (`cities.active`). Quem mora numa cidade não cadastrada não tinha como usar o app nem pedir a sua. Também não existia o conceito de **rede** (uma marca de supermercado com filiais em várias cidades): cada `store` pertence a uma só cidade, sem vínculo com as demais.

## Decisão

1. **Biblioteca de cidades = todos os municípios do IBGE** (5.571), carregados por migração congelada (`20261115000001_ibge_municipios.sql`), gerada por `scripts/gen-ibge-municipios.mjs`. Sem dependência de rede em execução. Não há tabela nova: `cities` já aceitava qualquer município.
2. **Escolher uma cidade é uma preferência pessoal** (cookie `compara-cidade` e, com sessão, `profiles.city_id`). Visitante anônimo nunca grava estado global, então ninguém "ativa" milhares de cidades por script. A validação passou de "cidade ativa" para "cidade existe" (`profile.cityExists`).
3. **`cities.active` continua sendo "habilitada no comparador"**, agora ligada **por gatilho** quando a primeira loja ativa de uma cidade **brasileira** aparece (`stores_sync_city_active`). Cidades de outros países continuam manuais (misturariam moedas no comparador). O admin pode desabilitar; o gatilho só age quando uma loja se torna ativa.
4. **Cidade sem mercados é "em breve"** (`coverage: "coming_soon"`): pode ser escolhida e mostra um estado vazio explicativo. Com mercados, `available`.
5. **A leitura de `cities` passou a ser pública** (política `cities_read` sem filtro): é dado de referência. O comparador, a lista de lojas e o perfil filtram `active` explicitamente.
6. **Busca no banco** (`search_cities`): sem acento (coluna gerada `name_search`), prefixo > trecho > aproximação (`pg_trgm`), filtro por UF; sem texto devolve as cidades com mercados (atalhos). Exposta em `GET /v1/cities/search` e `GET /v1/cities/:cityId` (módulo `modules/cities`, só leitura, com cache curto e limite por IP) e, para o navegador, em um Route Handler do Next (`/api/cidades`, GET cancelável pela digitação).
7. **Redes e sugestão de filial (próximas fases):** entidade `store_chains` com `stores.chain_id` opcional; sugestão em tabela própria `store_suggestions` (nunca insere direto em `stores`), com limites por usuário e detecção de duplicata; confirmação pelo admin e, depois, pela comunidade espelhando a regra da ADR-0010.

## Consequências

- ➕ Qualquer pessoa encontra a própria cidade e já a usa; a cobertura cresce sem o admin cadastrar cidade por cidade.
- ➕ Contrato aditivo (`CONTRACT_VERSION` 3.7.0): `CityDetail`, `CitySearchQuery`, `apiRoutes.citySearch`/`city`.
- ➖ A migração com os municípios tem ~200 KB. Atualizações do IBGE exigem rodar o script e criar uma nova migração.
- ➖ `cities.center` entra nulo (a API de localidades do IBGE não traz coordenadas); o mapa cai para o centro das lojas.
- ➖ A cidade da seed local agora vem da biblioteca: `seed.sql` apenas fixa os IDs e habilita a cidade piloto.
- ➖ O cache em memória da API (60 s) atrasa o selo "em breve → disponível" em outras instâncias.

## Alternativas descartadas

- **Ativação global por visitante anônimo:** abriria uma escrita pública e permitiria habilitar todas as cidades por script.
- **Pedido com aprovação do admin:** deixa a pessoa esperando e vira fila de moderação sem ganho real, já que cidade sem mercados não afeta o comparador.
