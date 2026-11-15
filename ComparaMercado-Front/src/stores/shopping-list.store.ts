"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

// A lista vive no aparelho (localStorage): funciona sem login e offline. Quando há login, o motor de
// sincronização (`modules/shopping-list/list-sync.ts`) a espelha na conta. Este arquivo guarda a
// lista, o que se sabe sobre a última sincronização e o estado exibido na interface; não fala com
// a rede.

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
    if (storageEvent.key === SYNC_META_KEY) cachedMeta = null;
  };
  window.addEventListener("storage", onStorageEvent);
  return () => {
    changeListeners.delete(onChange);
    window.removeEventListener("storage", onStorageEvent);
  };
}

// ── O que o aparelho sabe da última sincronização ──────────────────────────────────────────────

/**
 * - `ownerId`: a conta com a qual a lista foi sincronizada pela última vez (`null` = nunca);
 * - `baseUpdatedAt`: a versão do servidor vista nessa sincronização;
 * - `dirty`: há alterações locais ainda não enviadas.
 */
export interface ListSyncMeta {
  ownerId: string | null;
  baseUpdatedAt: string | null;
  dirty: boolean;
}

const SYNC_META_KEY = "compara:list:sync:v1";
const DEFAULT_META: ListSyncMeta = Object.freeze({
  ownerId: null,
  baseUpdatedAt: null,
  dirty: false,
});
const SyncMetaSchema = z.object({
  ownerId: z.uuid().nullable(),
  baseUpdatedAt: z.string().max(40).nullable(),
  dirty: z.boolean(),
});

let cachedMeta: ListSyncMeta | null = null;

export function readSyncMeta(): ListSyncMeta {
  if (cachedMeta) return cachedMeta;
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    const parsed = raw ? SyncMetaSchema.safeParse(JSON.parse(raw)) : null;
    cachedMeta = parsed?.success ? parsed.data : DEFAULT_META;
  } catch {
    cachedMeta = DEFAULT_META;
  }
  return cachedMeta;
}

function writeSyncMeta(meta: ListSyncMeta): void {
  cachedMeta = meta;
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // sem armazenamento: a sincronização recomeça do zero na próxima sessão
  }
}

// ── Alterações feitas pela pessoa (não as vindas da sincronização) ─────────────────────────────

let localEditCount = 0;
const localEditListeners = new Set<() => void>();

/** Quantas edições a pessoa fez nesta sessão; o motor compara antes e depois de sincronizar. */
export function getLocalEditCount(): number {
  return localEditCount;
}

/** Avisa quando a PESSOA altera a lista (adicionar, mudar quantidade, remover, limpar). */
export function onLocalListEdit(listener: () => void): () => void {
  localEditListeners.add(listener);
  return () => localEditListeners.delete(listener);
}

function commitLocalEdit(nextList: readonly StoredItem[]): void {
  localEditCount += 1;
  writeSyncMeta({ ...readSyncMeta(), dirty: true });
  writeStoredList(nextList);
  for (const listener of localEditListeners) listener();
}

/** A lista como está agora (para o motor de sincronização; componentes usam `useList`). */
export function readList(): readonly StoredItem[] {
  return readStoredList();
}

/**
 * Aplica o resultado de uma sincronização: troca a lista (se `list` for informada) e guarda o que
 * se sabe da conta. Não conta como edição da pessoa.
 */
export function applySync(result: {
  list?: readonly StoredItem[];
  ownerId: string;
  baseUpdatedAt: string | null;
  dirty: boolean;
}): void {
  writeSyncMeta({
    ownerId: result.ownerId,
    baseUpdatedAt: result.baseUpdatedAt,
    dirty: result.dirty,
  });
  if (result.list) writeStoredList(result.list.slice(0, MAX_LIST_ITEMS));
}

// ── Estado da sincronização exibido na interface ───────────────────────────────────────────────

export interface ListSyncState {
  /** `null` = ainda não sabemos (nenhuma tentativa nesta sessão). */
  signedIn: boolean | null;
  phase: "idle" | "syncing" | "error";
}

let syncState: ListSyncState = Object.freeze({ signedIn: null, phase: "idle" });
const syncStateListeners = new Set<() => void>();

export function setListSyncState(next: Partial<ListSyncState>): void {
  const merged = { ...syncState, ...next };
  if (merged.signedIn === syncState.signedIn && merged.phase === syncState.phase) return;
  syncState = Object.freeze(merged);
  for (const listener of syncStateListeners) listener();
}

export function getListSyncState(): ListSyncState {
  return syncState;
}

const SERVER_SYNC_STATE: ListSyncState = Object.freeze({ signedIn: null, phase: "idle" });

/** Estado da sincronização para a interface: "salva na conta" ou "salva neste aparelho". */
export function useListSyncState(): ListSyncState {
  return useSyncExternalStore(
    (onChange) => {
      syncStateListeners.add(onChange);
      return () => syncStateListeners.delete(onChange);
    },
    getListSyncState,
    () => SERVER_SYNC_STATE,
  );
}

// ── Ações da pessoa sobre a lista ──────────────────────────────────────────────────────────────

export const listActions = {
  add(newItem: { productId: string; name: string }): void {
    const currentList = readStoredList();
    const isAlreadyInList = currentList.some((item) => item.productId === newItem.productId);
    if (isAlreadyInList) {
      commitLocalEdit(
        currentList.map((item) =>
          item.productId === newItem.productId
            ? { ...item, quantity: Math.min(MAX_ITEM_QUANTITY, item.quantity + 1) }
            : item,
        ),
      );
    } else if (currentList.length < MAX_LIST_ITEMS) {
      commitLocalEdit([...currentList, { ...newItem, quantity: 1 }]);
    }
  },
  setQuantity(productId: string, requestedQuantity: number): void {
    const clampedQuantity = Math.max(0, Math.min(MAX_ITEM_QUANTITY, Math.trunc(requestedQuantity)));
    commitLocalEdit(
      clampedQuantity === 0
        ? readStoredList().filter((item) => item.productId !== productId)
        : readStoredList().map((item) =>
            item.productId === productId ? { ...item, quantity: clampedQuantity } : item,
          ),
    );
  },
  remove(productId: string): void {
    commitLocalEdit(readStoredList().filter((item) => item.productId !== productId));
  },
  clear(): void {
    commitLocalEdit(EMPTY_LIST);
  },
};

export function useList(): readonly StoredItem[] {
  return useSyncExternalStore(subscribe, readStoredList, () => EMPTY_LIST);
}

/** Só para testes: volta o estado em memória ao inicial (o armazenamento é do próprio teste). */
export function resetListStoreForTests(): void {
  cachedList = null;
  cachedMeta = null;
  localEditCount = 0;
  localEditListeners.clear();
  changeListeners.clear();
  syncState = Object.freeze({ signedIn: null, phase: "idle" });
}
