# ADR-0015 — Lista de compras sincronizada com a conta

- **Status:** Aceito (implementado: banco, API, aparelho e testes)
- **Data:** 2026-11-13
- **Decisor:** Kauã Buhs
- **Relacionados:** [ADR-0009](0009-perfil-consentimento-e-cidade.md) (perfil e privacidade), [ADR-0013](0013-cadastro-base-pelo-painel-admin.md)

## Contexto

A lista de compras vivia só no `localStorage`: quem trocava de aparelho ou limpava o navegador a perdia. As tabelas `shopping_lists` e `list_items` existiam com RLS, mas nenhum código as usava. A lista também precisa continuar funcionando **sem login e offline** (é o uso principal do PWA).

## Decisão

1. **O aparelho continua sendo a base.** A lista segue no `localStorage` (mesma chave), com ou sem login. Com login, ela é espelhada na conta. Sem rede, tudo funciona e as alterações ficam marcadas como pendentes.
2. **Uma lista por pessoa** ("Minha lista"). A troca dos itens é a função SQL `replace_shopping_list(jsonb)` (`20261114000006`): atômica, executa como a própria pessoa (a RLS vale), ignora produtos que ela não pode ver e quantidades inválidas, e guarda a ordem (`list_items.position`).
3. **Um único endpoint**, `POST /v1/me/list/sync`: o aparelho manda o que tem e o que sabe da última sincronização (`localOwnerId`, `baseUpdatedAt`, `dirty`); a API devolve a lista que passa a valer. A política de quem vence é uma função pura testada (`lib/list-sync.ts`):
   - lista de **outra conta** no aparelho: vale a do servidor (nunca mistura duas pessoas);
   - lista **nunca sincronizada** (montada sem login): une com a da conta;
   - sem alterações locais: vale a do servidor (traz o que mudou em outro aparelho);
   - com alterações e o servidor parado desde a última vez: vale o aparelho (inclusive apagar e limpar);
   - com alterações e o servidor também alterado: **une** (maior quantidade de cada produto), sem perder item.
4. **Quando sincroniza** (`modules/shopping-list/list-sync.ts`): ao abrir `/lista` e `/conta`, depois de cada edição (com espera de 1 s para agrupar cliques), ao voltar a conexão e ao reabrir a aba. Quem não tem conta gera no máximo uma checagem por minuto. Edição feita durante o envio nunca é atropelada: fica pendente e sai na rodada seguinte.
5. **A interface diz onde a lista está**: "Salva na sua conta" ou "Salva só neste aparelho. Entre na sua conta…". Os textos de privacidade foram atualizados (a lista deixa de ser "só no aparelho" para quem tem conta).
6. Contrato aditivo (3.6.0): `SyncListRequest`/`SyncListResponse`.

## Consequências

- ➕ Trocar de aparelho não perde a lista; sem login continua tudo igual.
- ➕ A regra de conflito mora no back-end e é testada sem rede; o front só decide _quando_ sincronizar.
- ➖ Ler e gravar não são uma transação: dois aparelhos sincronizando no mesmo instante podem sobrescrever um ao outro (vale o último); a sincronização seguinte os reconcilia.
- ➖ Itens apagados num aparelho voltam se outro aparelho editou a lista a partir da mesma versão antiga (a união prefere não perder).
- ➖ A lista guarda produto e quantidade, não o nome: o nome vem do catálogo a cada sincronização; produto arquivado sai da lista.
- ➖ A lista de uma conta excluída some junto (`on delete cascade`); exportar/excluir conta ainda não existe (Fase 5).
