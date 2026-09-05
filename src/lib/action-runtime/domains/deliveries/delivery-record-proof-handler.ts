import { recordProofOfDelivery } from "@/lib/core/deliveries/delivery-intelligence.service";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * delivery.recordProof — wraps recordProofOfDelivery, the same canonical
 * service PATCH /api/deliveries/[deliveryId] (action: "proof") already
 * called. Not reversible: a delivery proof is an additive record of what
 * happened, not a state transition — there is no natural "undo" for a
 * confirmation code or receiver name once recorded.
 */
export async function handleDeliveryRecordProof(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const deliveryId = requiredString(envelope.input.deliveryId, "deliveryId");
  const organizationId = envelope.executionContext.organizationId;

  const confirmationCode = optionalString(envelope.input.confirmationCode);
  const receiverName = optionalString(envelope.input.receiverName);
  const note = optionalString(envelope.input.note);
  if (!confirmationCode && !receiverName && !note) throw new Error("At least one of confirmationCode, receiverName, or note is required.");

  const delivery = await recordProofOfDelivery(deliveryId, organizationId, { confirmationCode, receiverName, note });
  if (!delivery) throw new Error("Delivery not found.");

  return {
    status: "SUCCESS",
    entityRef: { entityType: "delivery", entityId: delivery.id },
    resultSummary: "delivery.recordProof applied.",
    metadata: { deliveryId: delivery.id, confirmationCode: confirmationCode ?? null, receiverName: receiverName ?? null },
    domainEvents: [],
    sideEffects: [],
  };
}
