/**
 * Sincronização da lista de compras entre o aparelho e a conta: regra pura (sem banco nem HTTP).
 *
 * O aparelho guarda a lista no navegador (funciona sem login e offline) e a espelha na conta quando
 * há login. O que pode dar errado é duas cópias divergirem; a política abaixo escolhe sempre o
 * resultado que **não perde item** sem trazer de volta o que a pessoa apagou de propósito.
 */

import { MAX_LIST_ITEM_QUANTITY, MAX_LIST_ITEMS } from "../contracts";

// Os limites vivem no contrato (a API valida a entrada com eles); reexportados para quem usa a regra.
export { MAX_LIST_ITEM_QUANTITY, MAX_LIST_ITEMS };

export interface ListLine {
  productId: string;
  quantity: number;
}

/** A lista da conta como está no servidor (`updatedAt` `null` = a pessoa ainda não tem lista). */
export interface ServerList {
  lines: ListLine[];
  updatedAt: string | null;
}

/** A lista do aparelho e o que ele sabe sobre a última sincronização (ver `SyncListRequest`). */
export interface LocalList {
  lines: ListLine[];
  baseUpdatedAt: string | null;
  dirty: boolean;
  /** Conta com a qual o aparelho sincronizou pela última vez; `null` = nunca sincronizou. */
  ownerId: string | null;
}

export interface ListSyncDecision {
  /** A lista que passa a valer nos dois lados. */
  lines: ListLine[];
  /** `true` quando o servidor precisa ser atualizado para refletir `lines`. */
  write: boolean;
}

/**
 * União de duas listas: cada produto aparece uma vez, com a **maior** quantidade das duas (somar
 * dobraria a lista a cada sincronização). Mantém a ordem de `first` e acrescenta o que só existe em
 * `second`. Respeita o teto de itens.
 */
export function mergeLists(first: readonly ListLine[], second: readonly ListLine[]): ListLine[] {
  const merged = new Map<string, number>();
  for (const line of [...first, ...second]) {
    const quantity = Math.min(MAX_LIST_ITEM_QUANTITY, Math.max(1, Math.trunc(line.quantity)));
    const current = merged.get(line.productId);
    if (current !== undefined) merged.set(line.productId, Math.max(current, quantity));
    else if (merged.size < MAX_LIST_ITEMS) merged.set(line.productId, quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Mesmas linhas, na mesma ordem. */
export function sameLines(a: readonly ListLine[], b: readonly ListLine[]): boolean {
  return (
    a.length === b.length &&
    a.every((line, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        other.productId === line.productId &&
        other.quantity === line.quantity
      );
    })
  );
}

/**
 * Decide o resultado da sincronização de `userId`:
 *
 *  - lista do aparelho pertence a **outra conta**: vale a do servidor (nunca mistura as listas de
 *    duas pessoas que usaram o mesmo aparelho);
 *  - lista **nunca sincronizada** (montada sem login): une com a da conta, sem perder nada;
 *  - aparelho já sincronizado com esta conta e **sem alterações**: vale a do servidor (traz o que
 *    foi mudado em outro aparelho);
 *  - com alterações e o servidor **não mudou** desde a última sincronização: vale a do aparelho
 *    (inclusive apagar itens ou limpar a lista);
 *  - com alterações e o servidor **também mudou** (dois aparelhos editaram): une as duas.
 */
export function resolveListSync(
  server: ServerList,
  local: LocalList,
  userId: string,
): ListSyncDecision {
  const keep = (lines: ListLine[]): ListSyncDecision => ({
    lines,
    write: !sameLines(lines, server.lines),
  });

  if (local.ownerId !== null && local.ownerId !== userId)
    return { lines: server.lines, write: false };
  if (local.ownerId === null) return keep(mergeLists(server.lines, local.lines));
  if (!local.dirty) return { lines: server.lines, write: false };
  if (local.baseUpdatedAt === server.updatedAt) return keep(mergeLists([], local.lines));
  return keep(mergeLists(server.lines, local.lines));
}
