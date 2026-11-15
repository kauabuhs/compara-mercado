import { resolveListSync } from "../../../lib/list-sync";
import type { MyListRepository, MyListService } from "../my-list.types";

/**
 * Caso de uso da sincronização: lê a lista da conta, aplica a política de `lib/list-sync.ts` e,
 * se o resultado difere do que está salvo, grava. Devolve sempre a lista da conta já atualizada,
 * para o aparelho passar a espelhá-la.
 *
 * Limitação conhecida: ler e gravar não são uma transação. Dois aparelhos sincronizando no mesmo
 * instante podem sobrescrever um ao outro (vale o último); a próxima sincronização os reconcilia.
 */
export function createMyListService(repository: MyListRepository): MyListService {
  return {
    async sync(userId, request) {
      const stored = await repository.read();
      const decision = resolveListSync(
        {
          lines: stored.items.map(({ productId, quantity }) => ({ productId, quantity })),
          updatedAt: stored.updatedAt,
        },
        {
          lines: request.items,
          baseUpdatedAt: request.baseUpdatedAt,
          dirty: request.dirty,
          ownerId: request.localOwnerId,
        },
        userId,
      );
      if (decision.write) await repository.replace(decision.lines);
      const current = decision.write ? await repository.read() : stored;
      return { items: current.items, updatedAt: current.updatedAt, ownerId: userId };
    },
  };
}
