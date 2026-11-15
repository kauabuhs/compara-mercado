# ADR-0013 — Cadastro-base (cidades, mercados, categorias, produtos) pelo painel admin

- **Status:** Aceito (implementado: API, painel e testes)
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0012](0012-autenticacao-e-acesso-admin.md) (papel admin), [ADR-0010](0010-comunidade-de-precos-e-confianca.md)

## Contexto

O app lia dados reais, mas o cadastro-base só entrava por SQL ou pelo `seed.sql` fictício. Em staging/produção o banco abriria vazio e ninguém conseguiria cadastrar a primeira cidade, mercado ou produto. As políticas de RLS de escrita para `admin` já existiam desde a migração `20261109000004`; faltavam API e telas.

## Decisão

1. **Novo módulo `modules/registry`** no back-end (`controller → service → repository`), com rotas `GET/POST /v1/admin/{cities,stores,categories,products}` e `PATCH …/:id`. Exige login e papel `admin`; roda com o cliente do próprio usuário (sem `service_role`), então a RLS segue sendo a barreira final.
2. **Nada é apagado.** Não há `DELETE`: "excluir" é desabilitar cidade, inativar mercado ou arquivar produto, porque as observações de preço são imutáveis e referenciam essas linhas. Categorias não têm situação (a leitura pública já as mostra todas): só renomear ou mudar de pai.
3. **Regras no lugar certo.** O que o banco garante (unicidade de IBGE, slug, CNPJ e GTIN; referências; país da cidade × mercado) volta como erro de negócio (`409 duplicate`, `400 invalid_reference`, `400 constraint_violation`). O que o banco não expressa fica em `service/registry.service.ts`: dígito verificador do GTIN (`lib/gtin.ts`) e categorias sem ciclo.
4. **Marca e categoria do produto pertencem à família** (`product_families`, gatilho `a_products_resolve_family`). Criar produto com marca e categoria cria ou reaproveita a família; mudar a categoria de um produto muda a da família (vale para as variantes). A **marca não é editável por produto** nesta versão: exigiria um cadastro de marcas.
5. **Contrato aditivo** (`CONTRACT_VERSION` 3.4.0): schemas `Admin*`, `Create*Request`, `Update*Request` em `contracts/index.ts`.
6. **Painel** em `/admin/{cidades,mercados,categorias,produtos}`: lista paginada com busca e filtro de situação por URL, cadastro e edição por formulário, ativar/desativar com confirmação. O envio dos formulários é feito em `onSubmit` + `startTransition`, para o React 19 não limpar os campos quando a ação falha.

## Consequências

- ➕ O catálogo real passa a ser cadastrável sem SQL; o admin cria cidade → mercado → produto e lança preço.
- ➕ Cobertura: testes unitários (rotas e regras) e integração contra o Supabase local (`registry.integration.test.ts`).
- ➖ O cache em memória da API pública (60 s a 5 min por instância) faz o público ver a mudança com atraso; o Next é invalidado na hora (`updateTag`).
- ➖ Seletores de cidade e categoria carregam até 50 itens (limite da API). Com mais, será preciso busca no seletor.
- ➖ A integração não apaga o que cria: deixa cidade desabilitada, mercado inativo, produto arquivado e duas categorias `zz-teste-*` no banco local.
- ➖ Cadastro em lote continua por script (`importCatalog`, ainda sem chamador de produção) e a marca por produto fica para depois.
