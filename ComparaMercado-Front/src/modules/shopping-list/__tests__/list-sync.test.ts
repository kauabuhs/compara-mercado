import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getListSyncState,
  listActions,
  readList,
  readSyncMeta,
  resetListStoreForTests,
} from "@/stores/shopping-list.store";

vi.mock("@/modules/shopping-list/actions", () => ({ syncListAction: vi.fn() }));

import { syncListAction } from "@/modules/shopping-list/actions";
import { resetListSyncForTests, scheduleListSync, syncListNow } from "../list-sync";

const ME = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "cccccccc-0000-4000-8000-00000000000c";

const syncAction = vi.mocked(syncListAction);

function installLocalStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
}

const okResponse = (
  items: { productId: string; quantity: number; name: string }[],
  updatedAt: string,
) => ({ status: "ok" as const, data: { items, updatedAt, ownerId: ME } });

beforeEach(() => {
  vi.useFakeTimers();
  installLocalStorage();
  resetListStoreForTests();
  resetListSyncForTests();
  syncAction.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("motor de sincronização da lista", () => {
  it("sem conta: não mexe na lista, marca 'sem conta' e mantém as alterações pendentes", async () => {
    listActions.add({ productId: A, name: "Arroz" });
    syncAction.mockResolvedValue({ status: "anonymous" });

    await syncListNow();

    expect(syncAction).toHaveBeenCalledWith({
      items: [{ productId: A, quantity: 1 }],
      baseUpdatedAt: null,
      dirty: true,
      localOwnerId: null,
    });
    expect(readList()).toEqual([{ productId: A, name: "Arroz", quantity: 1 }]);
    expect(readSyncMeta().dirty).toBe(true); // continua pendente para quando entrar na conta
    expect(getListSyncState()).toEqual({ signedIn: false, phase: "idle" });
  });

  it("com conta: passa a espelhar a lista do servidor e guarda dono e versão", async () => {
    listActions.add({ productId: A, name: "Arroz" });
    syncAction.mockResolvedValue(
      okResponse(
        [
          { productId: A, quantity: 2, name: "Arroz" },
          { productId: B, quantity: 1, name: "Feijão" },
        ],
        "v2",
      ),
    );

    await syncListNow();

    expect(readList()).toEqual([
      { productId: A, name: "Arroz", quantity: 2 },
      { productId: B, name: "Feijão", quantity: 1 },
    ]);
    expect(readSyncMeta()).toEqual({ ownerId: ME, baseUpdatedAt: "v2", dirty: false });
    expect(getListSyncState()).toEqual({ signedIn: true, phase: "idle" });
  });

  it("a próxima sincronização informa dono, versão e o que está pendente", async () => {
    syncAction.mockResolvedValueOnce(
      okResponse([{ productId: A, quantity: 1, name: "Arroz" }], "v2"),
    );
    await syncListNow();
    listActions.setQuantity(A, 4);
    syncAction.mockResolvedValueOnce(
      okResponse([{ productId: A, quantity: 4, name: "Arroz" }], "v3"),
    );

    await syncListNow();

    expect(syncAction).toHaveBeenLastCalledWith({
      items: [{ productId: A, quantity: 4 }],
      baseUpdatedAt: "v2",
      dirty: true,
      localOwnerId: ME,
    });
    expect(readSyncMeta()).toEqual({ ownerId: ME, baseUpdatedAt: "v3", dirty: false });
  });

  it("edição feita durante o envio não é atropelada: fica pendente e sai na rodada seguinte", async () => {
    listActions.add({ productId: A, name: "Arroz" });
    let finish: (value: ReturnType<typeof okResponse>) => void = () => {};
    syncAction.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    const running = syncListNow();
    listActions.add({ productId: C, name: "Café" }); // a pessoa mexe enquanto sincroniza
    finish(okResponse([{ productId: A, quantity: 1, name: "Arroz" }], "v2"));
    await running;

    expect(readList().map((item) => item.productId)).toEqual([A, C]); // a edição foi preservada
    expect(readSyncMeta()).toEqual({ ownerId: ME, baseUpdatedAt: "v2", dirty: true });

    syncAction.mockResolvedValueOnce(
      okResponse(
        [
          { productId: A, quantity: 1, name: "Arroz" },
          { productId: C, quantity: 1, name: "Café" },
        ],
        "v3",
      ),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(syncAction).toHaveBeenCalledTimes(2);
    expect(syncAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseUpdatedAt: "v2", dirty: true, localOwnerId: ME }),
    );
    expect(readSyncMeta().dirty).toBe(false);
  });

  it("falha de rede: lista intacta, alterações pendentes e estado de erro", async () => {
    listActions.add({ productId: A, name: "Arroz" });
    syncAction.mockRejectedValue(new Error("offline"));

    await syncListNow();

    expect(readList()).toEqual([{ productId: A, name: "Arroz", quantity: 1 }]);
    expect(readSyncMeta().dirty).toBe(true);
    expect(getListSyncState().phase).toBe("error");
  });

  it("erro da API também mantém tudo como estava", async () => {
    listActions.add({ productId: B, name: "Feijão" });
    syncAction.mockResolvedValue({ status: "error" });
    await syncListNow();
    expect(readList()).toHaveLength(1);
    expect(readSyncMeta().dirty).toBe(true);
    expect(getListSyncState().phase).toBe("error");
  });

  it("chamadas simultâneas nunca rodam juntas: a segunda vira uma rodada depois", async () => {
    let finish: (value: ReturnType<typeof okResponse>) => void = () => {};
    syncAction.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    syncAction.mockResolvedValue(okResponse([], "v3"));

    const first = syncListNow();
    await syncListNow(); // segunda enquanto a primeira não terminou
    expect(syncAction).toHaveBeenCalledTimes(1);

    finish(okResponse([], "v2"));
    await first;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(syncAction).toHaveBeenCalledTimes(2);
  });

  it("quem não tem conta não dispara chamada a cada clique (reconfere no máximo 1x por minuto)", async () => {
    syncAction.mockResolvedValue({ status: "anonymous" });
    await syncListNow();
    expect(syncAction).toHaveBeenCalledTimes(1);

    scheduleListSync();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(syncAction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000); // passou o minuto
    scheduleListSync();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(syncAction).toHaveBeenCalledTimes(2);
  });

  it("agrupa várias edições seguidas numa única sincronização", async () => {
    syncAction.mockResolvedValue(okResponse([], "v2"));
    syncAction.mockResolvedValueOnce(
      okResponse([{ productId: A, quantity: 3, name: "Arroz" }], "v2"),
    );
    listActions.add({ productId: A, name: "Arroz" });
    scheduleListSync();
    listActions.setQuantity(A, 2);
    scheduleListSync();
    listActions.setQuantity(A, 3);
    scheduleListSync();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(syncAction).toHaveBeenCalledTimes(1);
    expect(syncAction).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ productId: A, quantity: 3 }] }),
    );
  });
});
