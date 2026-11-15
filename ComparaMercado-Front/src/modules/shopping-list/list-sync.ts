import { syncListAction } from "@/modules/shopping-list/actions";
import {
  applySync,
  getListSyncState,
  getLocalEditCount,
  readList,
  readSyncMeta,
  setListSyncState,
} from "@/stores/shopping-list.store";

// Motor de sincronização da lista (roda no navegador). A lista do aparelho continua sendo a base;
// aqui só a enviamos à API e passamos a espelhar a resposta. QUEM VENCE em caso de divergência é
// decidido pela API (`lib/list-sync.ts` no back-end): este arquivo só cuida de quando sincronizar.

/** Agrupa cliques seguidos (várias quantidades, vários itens) numa única chamada. */
const SIGNED_IN_DEBOUNCE_MS = 1_000;
/** Quem não tem conta não precisa perguntar a cada clique: reconfere de vez em quando. */
const ANONYMOUS_RECHECK_MS = 60_000;

let inFlight = false;
let rerunRequested = false;
let scheduledTimer: ReturnType<typeof setTimeout> | undefined;
let lastAnonymousCheckAt = 0;

/** Sincroniza agora. Chamadas simultâneas viram uma segunda rodada, nunca duas ao mesmo tempo. */
export async function syncListNow(): Promise<void> {
  if (inFlight) {
    rerunRequested = true;
    return;
  }
  inFlight = true;
  setListSyncState({ phase: "syncing" });
  try {
    const editsBefore = getLocalEditCount();
    const meta = readSyncMeta();
    const result = await syncListAction({
      items: readList().map(({ productId, quantity }) => ({ productId, quantity })),
      baseUpdatedAt: meta.baseUpdatedAt,
      dirty: meta.dirty,
      localOwnerId: meta.ownerId,
    });

    if (result.status === "anonymous") {
      // Sem conta (ou sessão vencida): a lista segue só no aparelho, intacta.
      lastAnonymousCheckAt = Date.now();
      setListSyncState({ signedIn: false, phase: "idle" });
      return;
    }
    if (result.status === "error") {
      setListSyncState({ phase: "error" });
      return;
    }

    const { items, updatedAt, ownerId } = result.data;
    if (getLocalEditCount() !== editsBefore) {
      // A pessoa mexeu na lista enquanto sincronizava: não atropelamos a edição. Guardamos a nova
      // versão do servidor como base e mandamos a edição na rodada seguinte.
      applySync({ ownerId, baseUpdatedAt: updatedAt, dirty: true });
      rerunRequested = true;
    } else {
      applySync({
        list: items.map(({ productId, quantity, name }) => ({ productId, quantity, name })),
        ownerId,
        baseUpdatedAt: updatedAt,
        dirty: false,
      });
    }
    setListSyncState({ signedIn: true, phase: "idle" });
  } catch {
    // Sem rede: as alterações continuam marcadas como pendentes e saem quando a conexão voltar.
    setListSyncState({ phase: "error" });
  } finally {
    inFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      scheduleListSync();
    }
  }
}

/** Agenda uma sincronização (com espera para agrupar edições). Sem efeito para quem não tem conta. */
export function scheduleListSync(delayMs: number = SIGNED_IN_DEBOUNCE_MS): void {
  const { signedIn } = getListSyncState();
  if (signedIn === false && Date.now() - lastAnonymousCheckAt < ANONYMOUS_RECHECK_MS) return;
  clearTimeout(scheduledTimer);
  scheduledTimer = setTimeout(() => {
    void syncListNow();
  }, delayMs);
}

/** Só para testes: volta o estado em memória do motor ao inicial. */
export function resetListSyncForTests(): void {
  clearTimeout(scheduledTimer);
  inFlight = false;
  rerunRequested = false;
  lastAnonymousCheckAt = 0;
}
