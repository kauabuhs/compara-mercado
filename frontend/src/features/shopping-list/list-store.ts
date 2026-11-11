"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

// A lista vive no aparelho (localStorage): funciona sem login e offline.
// Sincronizar com `shopping_lists` para usuários logados fica para depois do MVP.

const MAX_LIST_ITEMS = 100;
const MAX_ITEM_QUANTITY = 99;

const StoredItemSchema = z.object({
  productId: z.uuid(),
  name: z.string().max(200),
  quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
});
const StoredListSchema = z.array(StoredItemSchema).max(MAX_LIST_ITEMS);

export type StoredItem = z.infer<typeof StoredItemSchema>;

// Chave já gravada nos aparelhos dos usuários: mudar o valor apagaria as listas existentes.
const STORAGE_KEY = "compara:list:v1";
const EMPTY_LIST: readonly StoredItem[] = Object.freeze([]);

let cachedList: readonly StoredItem[] | null = null;
const changeListeners = new Set<() => void>();

function readStoredList(): readonly StoredItem[] {
  if (cachedList) return cachedList;
  try {
    const rawStoredList = localStorage.getItem(STORAGE_KEY);
    const parsedList = rawStoredList ? StoredListSchema.safeParse(JSON.parse(rawStoredList)) : null;
    cachedList = parsedList?.success ? parsedList.data : EMPTY_LIST;
  } catch {
    cachedList = EMPTY_LIST; // armazenamento bloqueado ou dado corrompido: começa vazio
  }
  return cachedList;
}

function writeStoredList(nextList: readonly StoredItem[]): void {
  cachedList = nextList;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
  } catch {
    // sem armazenamento: a lista vale só nesta sessão
  }
  for (const notifyChange of changeListeners) notifyChange();
}

function subscribe(onChange: () => void): () => void {
  changeListeners.add(onChange);
  const onStorageEvent = (storageEvent: StorageEvent) => {
    if (storageEvent.key === STORAGE_KEY) {
      cachedList = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorageEvent);
  return () => {
    changeListeners.delete(onChange);
    window.removeEventListener("storage", onStorageEvent);
  };
}

export const listActions = {
  add(newItem: { productId: string; name: string }): void {
    const currentList = readStoredList();
    const isAlreadyInList = currentList.some((item) => item.productId === newItem.productId);
    if (isAlreadyInList) {
      writeStoredList(
        currentList.map((item) =>
          item.productId === newItem.productId
            ? { ...item, quantity: Math.min(MAX_ITEM_QUANTITY, item.quantity + 1) }
            : item,
        ),
      );
    } else if (currentList.length < MAX_LIST_ITEMS) {
      writeStoredList([...currentList, { ...newItem, quantity: 1 }]);
    }
  },
  setQuantity(productId: string, requestedQuantity: number): void {
    const clampedQuantity = Math.max(0, Math.min(MAX_ITEM_QUANTITY, Math.trunc(requestedQuantity)));
    writeStoredList(
      clampedQuantity === 0
        ? readStoredList().filter((item) => item.productId !== productId)
        : readStoredList().map((item) =>
            item.productId === productId ? { ...item, quantity: clampedQuantity } : item,
          ),
    );
  },
  remove(productId: string): void {
    writeStoredList(readStoredList().filter((item) => item.productId !== productId));
  },
  clear(): void {
    writeStoredList(EMPTY_LIST);
  },
};

export function useList(): readonly StoredItem[] {
  return useSyncExternalStore(subscribe, readStoredList, () => EMPTY_LIST);
}
