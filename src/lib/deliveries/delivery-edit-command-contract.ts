import { isRecord } from "@/lib/api/validation";

export const DELIVERY_ITEM_CONDITIONS = ["OK", "SHORT", "DAMAGED", "WRONG_ITEM", "MIXED"] as const;
export const DELIVERY_EXCEPTION_CATEGORIES = ["CUSTOMER_NOT_AT_ADDRESS", "DELIVERY_REFUSED", "PRODUCT_DAMAGED", "VEHICLE_BREAKDOWN", "WRONG_ADDRESS", "SHORTAGE_FOUND", "DELIVERY_POSTPONED", "OTHER"] as const;
export const DELIVERY_STATUSES = ["DRAFT", "PREPARING", "PICKING", "PACKING", "LOADED", "DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED", "FAILED_DELIVERY", "RESCHEDULED", "CANCELLED"] as const;
export type DeliveryItemConditionValue = (typeof DELIVERY_ITEM_CONDITIONS)[number];
export type DeliveryExceptionCategoryValue = (typeof DELIVERY_EXCEPTION_CATEGORIES)[number];
export type DeliveryStatusValue = (typeof DELIVERY_STATUSES)[number];

export type DeliveryEditCommand =
  | { type: "flag_item_condition"; deliveryItemId: string; condition: DeliveryItemConditionValue }
  | { type: "record_exception"; category: DeliveryExceptionCategoryValue; note?: string }
  | { type: "record_proof"; confirmationCode?: string; receiverName?: string; signatureCaptured?: boolean; note?: string }
  | { type: "transition_status"; toStatus: DeliveryStatusValue; reason?: string }
  | { type: "cancel"; reason: string };

export type DeliveryEditCommandResolution = { kind: "executable"; command: DeliveryEditCommand } | { kind: "unsupported" } | { kind: "clarification_required"; message: string };
export type DeliveryEditCommandExecutionResult = { status: "EXECUTED"; command: DeliveryEditCommand } | { status: "UNSUPPORTED" } | { status: "CLARIFICATION_REQUIRED"; message: string } | { status: "NO_ACTIVE_SURFACE" } | { status: "STALE_SURFACE" } | { status: "VALIDATION_FAILED"; reason: string } | { status: "EXECUTION_FAILED"; error: string };

function optionalText(raw: Record<string, unknown>, key: string): string | undefined | null { if (!(key in raw)) return undefined; return typeof raw[key] === "string" ? raw[key].trim() : null; }
function requiredText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

export function validateDeliveryEditCommandResolution(raw: unknown): DeliveryEditCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.result === "unsupported") return { kind: "unsupported" };
  if (raw.result === "clarification_required") { const message = requiredText(raw.message); return message ? { kind: "clarification_required", message } : null; }
  if (raw.result !== "executable") return null;
  const reason = optionalText(raw, "reason"); if (reason === null) return null;
  switch (raw.action) {
    case "flag_item_condition": { const deliveryItemId = requiredText(raw.deliveryItemId); if (!deliveryItemId || typeof raw.condition !== "string" || !(DELIVERY_ITEM_CONDITIONS as readonly string[]).includes(raw.condition)) return null; return { kind: "executable", command: { type: "flag_item_condition", deliveryItemId, condition: raw.condition as DeliveryItemConditionValue } }; }
    case "record_exception": { if (typeof raw.category !== "string" || !(DELIVERY_EXCEPTION_CATEGORIES as readonly string[]).includes(raw.category)) return null; const note = optionalText(raw, "note"); if (note === null) return null; return { kind: "executable", command: { type: "record_exception", category: raw.category as DeliveryExceptionCategoryValue, ...(note !== undefined ? { note } : {}) } }; }
    case "record_proof": { const confirmationCode = optionalText(raw, "confirmationCode"); const receiverName = optionalText(raw, "receiverName"); const note = optionalText(raw, "note"); if (confirmationCode === null || receiverName === null || note === null || ("signatureCaptured" in raw && typeof raw.signatureCaptured !== "boolean")) return null; return { kind: "executable", command: { type: "record_proof", ...(confirmationCode !== undefined ? { confirmationCode } : {}), ...(receiverName !== undefined ? { receiverName } : {}), ...(raw.signatureCaptured !== undefined ? { signatureCaptured: raw.signatureCaptured as boolean } : {}), ...(note !== undefined ? { note } : {}) } }; }
    case "transition_status": { if (typeof raw.toStatus !== "string" || !(DELIVERY_STATUSES as readonly string[]).includes(raw.toStatus)) return null; return { kind: "executable", command: { type: "transition_status", toStatus: raw.toStatus as DeliveryStatusValue, ...(reason !== undefined ? { reason } : {}) } }; }
    case "cancel": { const requiredReason = requiredText(raw.reason); return requiredReason ? { kind: "executable", command: { type: "cancel", reason: requiredReason } } : null; }
    default: return null;
  }
}

export function revalidateDeliveryEditCommandResolution(raw: unknown): DeliveryEditCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "unsupported") return { kind: "unsupported" };
  if (raw.kind === "clarification_required") { const message = requiredText(raw.message); return message ? { kind: "clarification_required", message } : null; }
  if (raw.kind !== "executable" || !isRecord(raw.command)) return null;
  return validateDeliveryEditCommandResolution({ result: "executable", action: raw.command.type, ...raw.command });
}
