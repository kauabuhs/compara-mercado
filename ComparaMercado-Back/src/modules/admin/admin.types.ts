import type {
  AdminOverview,
  ManualPriceRequest,
  ModerationDecisionRequest,
  ModerationItem,
  ModerationQuery,
  PendingObservation,
  PriceFormOptions,
  ReviewDecision,
  ReviewQueueQuery,
} from "../../contracts";
import type { Paged } from "../../lib/pagination";

/** Operações de administração, executadas com a identidade (e a RLS) do próprio usuário. */
export interface AdminService {
  getOverview(): Promise<AdminOverview>;
  getPriceFormOptions(): Promise<PriceFormOptions>;
  getReviewQueue(query: ReviewQueueQuery): Promise<Paged<PendingObservation>>;
  createManualPrice(request: ManualPriceRequest, adminUserId: string): Promise<void>;
  /**
   * Registra a decisão sobre um preço pendente. `note` explica a rejeição a quem enviou.
   * `false` = nada foi decidido (não existe ou já saiu de "pending").
   */
  reviewObservation(
    observationId: string,
    decision: ReviewDecision,
    note?: string,
  ): Promise<boolean>;
  /** Tarefas abertas de moderação (preços denunciados ou contestados), mais antigas primeiro. */
  getModerationQueue(query: ModerationQuery): Promise<Paged<ModerationItem>>;
  /**
   * Decide uma tarefa de moderação: aprovar, rejeitar/retirar o preço ou mantê-lo como está.
   * `false` = a tarefa não existe ou já foi encerrada.
   */
  resolveModerationTask(
    taskId: string,
    decision: ModerationDecisionRequest,
    adminUserId: string,
  ): Promise<boolean>;
  /** Bytes (JPEG) da foto da etiqueta do envio; `null` se não há foto ou o envio não existe. */
  getObservationPhoto(observationId: string): Promise<Uint8Array | null>;
}

/** Serviço de administração amarrado ao token (a RLS vê o usuário, não um papel de serviço). */
export type AdminServiceFactory = (accessToken: string) => AdminService;
