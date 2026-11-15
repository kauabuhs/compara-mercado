import type {
  BaseUnit,
  ConfirmationVerdict,
  ConfirmObservationResponse,
  FeedItem,
  ReportReason,
  Reputation,
  ReputationEventKind,
  SizeUnit,
} from "../../contracts";
import type { FeedCursor } from "../../lib/cursor";

/** Códigos estáveis dos erros de negócio da comunidade (o controller os traduz para HTTP). */
export type CommunityErrorCode =
  /** O cursor de paginação é inválido. */
  | "invalid_cursor"
  /** A publicação não existe, expirou ou não está mais disponível. */
  | "observation_unavailable"
  /** Não se confirma nem se denuncia a própria publicação. */
  | "own_observation"
  /** Esta pessoa já confirmou/denunciou esta publicação. */
  | "already_done"
  /** Teto diário de confirmações ou denúncias atingido. */
  | "daily_limit";

/** Linha do feed como o banco devolve, já em camelCase (a camada de cima decide o selo). */
export interface FeedRow {
  id: string;
  createdAt: string;
  storeId: string;
  storeName: string;
  storeNeighborhood: string | null;
  distanceM: number | null;
  productId: string;
  productName: string;
  brand: string | null;
  sizeValue: number;
  sizeUnit: SizeUnit;
  baseUnit: BaseUnit;
  priceCents: number;
  unitPriceCents: number;
  promo: boolean;
  validTo: string | null;
  source: "manual" | "flyer" | "label_photo" | "receipt" | "store_panel";
  status: "pending" | "approved";
  approvedVia: "admin" | "community" | "trusted_author" | "store" | "pipeline" | null;
  confirmCount: number;
  changedCount: number;
  hasPhoto: boolean;
  authorLabel: string;
  authorLevel: number | null;
  isMine: boolean;
  myVerdict: ConfirmationVerdict | null;
}

export interface FeedFilter {
  cityId: string;
  where?: { lat: number; lng: number; radiusM?: number };
  promoOnly: boolean;
  after?: FeedCursor;
  limit: number;
}

export interface CommunityFeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface ReputationRecord {
  points: number;
  events: { kind: ReputationEventKind; points: number; createdAt: string }[];
}

/**
 * Porta do módulo, amarrada ao token do usuário (ou anônima, só para o feed). A autorização e as
 * regras de corroboração moram no banco (RLS e funções SQL); aqui só orquestramos e traduzimos.
 */
export interface CommunityService {
  feed(filter: Omit<FeedFilter, "after"> & { cursor?: string }): Promise<CommunityFeedPage>;
  /** Lança `DomainError` com `CommunityErrorCode`. */
  confirm(observationId: string, verdict: ConfirmationVerdict): Promise<ConfirmObservationResponse>;
  /** Lança `DomainError` com `CommunityErrorCode`. */
  report(observationId: string, reason: ReportReason): Promise<void>;
  /** Bytes da foto, ou `null` se a publicação não tem foto visível para este usuário. */
  getPhoto(observationId: string): Promise<Uint8Array | null>;
  reputation(userId: string): Promise<Reputation>;
}

/** `null` = visitante sem login (só o feed funciona). */
export type CommunityServiceFactory = (accessToken: string | null) => CommunityService;

/** Acesso a dados do módulo: a única camada que conhece RPCs, tabelas e o bucket. */
export interface CommunityRepository {
  listFeed(filter: FeedFilter): Promise<FeedRow[]>;
  /** Lança `DbError` com o SQLSTATE (`42501`, `P0002`, `23505`, `54000`). */
  confirm(
    observationId: string,
    verdict: ConfirmationVerdict,
  ): Promise<{ status: "pending" | "approved"; confirmCount: number; changedCount: number }>;
  /** Lança `DbError` com o SQLSTATE (`42501`, `P0002`, `23505`, `54000`). */
  report(observationId: string, reason: ReportReason): Promise<void>;
  photoPath(observationId: string): Promise<string | null>;
  downloadPhoto(path: string): Promise<Uint8Array | null>;
  /** Reputação e últimos eventos do usuário autenticado. */
  reputation(userId: string, eventLimit: number): Promise<ReputationRecord>;
}
