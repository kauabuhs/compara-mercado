import type {
  AdminOverview,
  ManualPriceRequest,
  PendingObservation,
  PriceFormOptions,
  ReviewDecision,
} from "../../contracts";

/** Operações de administração, executadas com a identidade (e a RLS) do próprio usuário. */
export interface AdminService {
  getOverview(): Promise<AdminOverview>;
  getPriceFormOptions(): Promise<PriceFormOptions>;
  getReviewQueue(): Promise<PendingObservation[]>;
  createManualPrice(request: ManualPriceRequest, adminUserId: string): Promise<void>;
  /** Registra a decisão. `false` = nada foi decidido (não existe ou já saiu de "pending"). */
  reviewObservation(observationId: string, decision: ReviewDecision): Promise<boolean>;
}

/** Serviço de administração amarrado ao token (a RLS vê o usuário, não um papel de serviço). */
export type AdminServiceFactory = (accessToken: string) => AdminService;
