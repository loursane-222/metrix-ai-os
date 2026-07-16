import { randomUUID } from "crypto";

import { isValidOutboxTransition } from "./outbox-transitions";
import { DuplicateOutboxEventError, InvalidOutboxTransitionError, OutboxEventNotFoundError } from "./outbox.errors";
import type {
  EnqueueOutboxEventInput,
  MarkRetryInput,
  OutboxDeliveryStatus,
  OutboxEvent,
  OutboxStore,
} from "./outbox.types";

export type InMemoryOutboxStoreOptions = {
  clock?: () => Date;
  generateId?: () => string;
  defaultMaxRetries?: number;
};

const DEFAULT_MAX_RETRIES = 3;

/**
 * Framework bağımsız in-memory implementasyon. Aynı eventId veya
 * deduplicationKey ile tekrar enqueue denemesi deterministik olarak
 * reddedilir. Her çağrı izole bir Map yaratır.
 */
export function createInMemoryOutboxStore(options: InMemoryOutboxStoreOptions = {}): OutboxStore {
  const clock = options.clock ?? (() => new Date());
  const generateId = options.generateId ?? (() => randomUUID());
  const defaultMaxRetries = options.defaultMaxRetries ?? DEFAULT_MAX_RETRIES;

  const events = new Map<string, OutboxEvent>();
  const dedupIndex = new Map<string, string>();

  function requireEvent(eventId: string): OutboxEvent {
    const event = events.get(eventId);
    if (!event) {
      throw new OutboxEventNotFoundError(eventId);
    }
    return event;
  }

  function assertTransition(event: OutboxEvent, to: OutboxDeliveryStatus): void {
    if (!isValidOutboxTransition(event.deliveryStatus, to)) {
      throw new InvalidOutboxTransitionError(event.eventId, event.deliveryStatus, to);
    }
  }

  function persist(event: OutboxEvent): OutboxEvent {
    const frozen: OutboxEvent = Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }) });
    events.set(event.eventId, frozen);
    return frozen;
  }

  return {
    enqueue(input: EnqueueOutboxEventInput) {
      const eventId = input.eventId ?? generateId();

      if (events.has(eventId)) {
        throw new DuplicateOutboxEventError(eventId);
      }

      if (input.deduplicationKey && dedupIndex.has(input.deduplicationKey)) {
        throw new DuplicateOutboxEventError(input.deduplicationKey);
      }

      const now = clock().toISOString();
      const event: OutboxEvent = {
        eventId,
        operationId: input.operationId,
        executionId: input.executionId,
        organizationId: input.organizationId,
        eventType: input.eventType,
        effectType: input.effectType,
        payload: input.payload,
        schemaVersion: input.schemaVersion,
        correlationId: input.correlationId,
        causationId: input.causationId,
        deliveryStatus: "PENDING",
        retryCount: 0,
        maxRetries: input.maxRetries ?? defaultMaxRetries,
        nextAttemptAt: now,
        createdAt: now,
        deduplicationKey: input.deduplicationKey,
      };

      const persisted = persist(event);

      if (input.deduplicationKey) {
        dedupIndex.set(input.deduplicationKey, eventId);
      }

      return persisted;
    },
    get(eventId) {
      return events.get(eventId);
    },
    claimPending(limit) {
      const nowMs = clock().getTime();
      const claimable = [...events.values()]
        .filter(
          (event) =>
            (event.deliveryStatus === "PENDING" || event.deliveryStatus === "RETRYING") &&
            new Date(event.nextAttemptAt).getTime() <= nowMs,
        )
        .slice(0, limit);

      return claimable.map((event) => {
        assertTransition(event, "PROCESSING");
        return persist({ ...event, deliveryStatus: "PROCESSING" });
      });
    },
    markProcessing(eventId) {
      const event = requireEvent(eventId);
      assertTransition(event, "PROCESSING");
      return persist({ ...event, deliveryStatus: "PROCESSING" });
    },
    markSucceeded(eventId) {
      const event = requireEvent(eventId);
      assertTransition(event, "SUCCEEDED");
      return persist({ ...event, deliveryStatus: "SUCCEEDED", processedAt: clock().toISOString() });
    },
    markRetry(eventId, retryOptions: MarkRetryInput) {
      const event = requireEvent(eventId);
      const nextRetryCount = event.retryCount + 1;

      if (nextRetryCount > event.maxRetries) {
        assertTransition(event, "DEAD_LETTERED");
        return persist({
          ...event,
          deliveryStatus: "DEAD_LETTERED",
          retryCount: nextRetryCount,
          lastErrorCode: retryOptions.errorCode ?? event.lastErrorCode,
        });
      }

      assertTransition(event, "RETRYING");
      return persist({
        ...event,
        deliveryStatus: "RETRYING",
        retryCount: nextRetryCount,
        nextAttemptAt: retryOptions.nextAttemptAt,
        lastErrorCode: retryOptions.errorCode ?? event.lastErrorCode,
      });
    },
    markDeadLettered(eventId, errorCode) {
      const event = requireEvent(eventId);
      assertTransition(event, "DEAD_LETTERED");
      return persist({ ...event, deliveryStatus: "DEAD_LETTERED", lastErrorCode: errorCode ?? event.lastErrorCode });
    },
    listByOperation(operationId) {
      return [...events.values()].filter((event) => event.operationId === operationId);
    },
    listPendingByOrganization(organizationId) {
      return [...events.values()].filter(
        (event) => event.organizationId === organizationId && event.deliveryStatus === "PENDING",
      );
    },
  };
}
