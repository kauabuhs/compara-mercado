import type { SyncedListItem, SyncListRequest, SyncListResponse } from "../../contracts";
import type { ListLine } from "../../lib/list-sync";

/** A lista da conta como o banco a devolve (só produtos que a pessoa pode ver). */
export interface StoredList {
  items: SyncedListItem[];
  /** Versão da lista; `null` = a pessoa ainda não tem lista. */
  updatedAt: string | null;
}

/** Porta do módulo, amarrada ao token do usuário (a RLS enxerga a própria pessoa). */
export interface MyListService {
  /** Reconcilia a lista do aparelho com a da conta e devolve a lista que passa a valer. */
  sync(userId: string, request: SyncListRequest): Promise<SyncListResponse>;
}

export type MyListServiceFactory = (accessToken: string) => MyListService;

/** Acesso a dados do módulo: a única camada que conhece `shopping_lists` e `list_items`. */
export interface MyListRepository {
  read(): Promise<StoredList>;
  /** Troca os itens da lista (atômico, no banco). Produtos que a pessoa não vê são ignorados. */
  replace(lines: readonly ListLine[]): Promise<void>;
}
