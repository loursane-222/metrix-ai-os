import type { OutboxDeliveryStatus } from "./outbox.types";

const VALID_TRANSITIONS: Readonly<Record<OutboxDeliveryStatus, readonly OutboxDeliveryStatus[]>> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["SUCCEEDED", "RETRYING", "DEAD_LETTERED"],
  RETRYING: ["PROCESSING", "DEAD_LETTERED"],
  SUCCEEDED: [],
  DEAD_LETTERED: [],
};

export function isValidOutboxTransition(from: OutboxDeliveryStatus, to: OutboxDeliveryStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
