export type OutboxDeliveryStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "RETRYING" | "DEAD_LETTERED";

/**
 * Domain Event ve dış yan etkilerin güvenilir teslimi için generic
 * kuyruk kaydı. Hiçbir gerçek worker/cron/external adapter bu fazda
 * çalıştırılmaz — yalnızca durum makinesi ve depolama sağlanır.
 */
export interface OutboxEvent {
  readonly eventId: string;
  readonly operationId: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly eventType: string;
  readonly effectType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly schemaVersion: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly deliveryStatus: OutboxDeliveryStatus;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly nextAttemptAt: string;
  readonly createdAt: string;
  readonly processedAt?: string;
  readonly lastErrorCode?: string;
  readonly deduplicationKey?: string;
}

/**
 * Handler'ın döndürdüğü, henüz Outbox'a yazılmamış genel yan-etki
 * tanımı. Handler hiçbir OutboxStore çağırmaz — yalnızca bu descriptor'ı
 * döndürür; enqueue sorumluluğu Execution Runtime'dadır.
 */
export type SideEffectDescriptor = {
  effectType: string;
  payload: Record<string, unknown>;
  schemaVersion: string;
  deduplicationKey?: string;
};

export type EnqueueOutboxEventInput = {
  eventId?: string;
  operationId: string;
  executionId: string;
  organizationId: string;
  eventType: string;
  effectType: string;
  payload: Record<string, unknown>;
  schemaVersion: string;
  correlationId: string;
  causationId?: string;
  maxRetries?: number;
  deduplicationKey?: string;
};

export type MarkRetryInput = {
  nextAttemptAt: string;
  errorCode?: string;
};

/**
 * Framework bağımsız soyutlama. Production'da kalıcı bir store ile
 * değiştirilebilir.
 */
export interface OutboxStore {
  enqueue(input: EnqueueOutboxEventInput): OutboxEvent;
  get(eventId: string): OutboxEvent | undefined;
  claimPending(limit: number): OutboxEvent[];
  markProcessing(eventId: string): OutboxEvent;
  markSucceeded(eventId: string): OutboxEvent;
  markRetry(eventId: string, options: MarkRetryInput): OutboxEvent;
  markDeadLettered(eventId: string, errorCode?: string): OutboxEvent;
  listByOperation(operationId: string): OutboxEvent[];
  listPendingByOrganization(organizationId: string): OutboxEvent[];
}
