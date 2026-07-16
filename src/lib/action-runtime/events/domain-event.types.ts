/**
 * Domain Event, kendi başına bir action execution yetkisi DEĞİLDİR.
 *
 * Bir consumer bu event'i tükettiğinde yeni bir eylem gerektiğine karar
 * verirse, Execution Runtime'a açık ve yeni bir ActionExecutionRequest
 * üretmesi gerekir — event'in varlığı bu isteği örtük olarak tetiklemez.
 *
 * Bu faz hiçbir gerçek event consumer içermez; yalnızca sözleşmeyi
 * tanımlar. Outbox, bu event'lerin güvenilir teslimini üstlenir ama
 * hiçbir teslim, kendiliğinden bir action çalıştırmaz.
 */
export interface DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly organizationId: string;
  readonly operationId: string;
  readonly executionId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly schemaVersion: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

/**
 * Handler'ın döndürdüğü, henüz gerçek bir DomainEvent'e genişletilmemiş
 * tanım. aggregateType/aggregateId/payload/schemaVersion dışındaki tüm
 * bağlamsal alanlar (organizationId, operationId, executionId,
 * correlationId, occurredAt, eventId) Execution Runtime tarafından
 * doldurulur — handler bunları bilmez.
 */
export type DomainEventDescriptor = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  schemaVersion: string;
  deduplicationKey?: string;
};
