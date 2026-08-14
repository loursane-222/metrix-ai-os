import { isRecord } from "@/lib/api/validation";

export const ORDER_EXCEPTION_CATEGORIES = ["CUSTOMER_HOLD_REQUEST", "PRODUCTION_STOPPED", "QUALITY_ISSUE", "SUPPLY_DELAY", "PAYMENT_HOLD", "SHIPMENT_DELAYED", "CUSTOMER_ADDRESS_CHANGED", "OTHER"] as const;
export const ORDER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PLANNED", "IN_PRODUCTION", "ON_HOLD", "READY", "PARTIALLY_SHIPPED", "SHIPPED", "COMPLETED", "CANCELLED"] as const;
export type OrderExceptionCategoryValue = (typeof ORDER_EXCEPTION_CATEGORIES)[number];
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export type OrderEditCommand =
  | { type: "revise_quantity"; orderItemId: string; quantity: number; reason?: string }
  | { type: "revise_deadline"; deadlineAt: string | null; reason?: string }
  | { type: "remove_item"; orderItemId: string; reason?: string }
  | { type: "record_exception"; category: OrderExceptionCategoryValue; note?: string }
  | { type: "transition_status"; toStatus: OrderStatusValue; reason?: string }
  | { type: "cancel"; reason: string };

export type OrderEditCommandResolution = { kind: "executable"; command: OrderEditCommand } | { kind: "unsupported" } | { kind: "clarification_required"; message: string };
export type OrderEditCommandExecutionResult = { status: "EXECUTED"; command: OrderEditCommand } | { status: "UNSUPPORTED" } | { status: "CLARIFICATION_REQUIRED"; message: string } | { status: "NO_ACTIVE_SURFACE" } | { status: "STALE_SURFACE" } | { status: "VALIDATION_FAILED"; reason: string } | { status: "EXECUTION_FAILED"; error: string };

function optionalText(raw: Record<string, unknown>, key: string): string | undefined | null {
  if (!(key in raw)) return undefined;
  return typeof raw[key] === "string" ? raw[key].trim() : null;
}
function requiredText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

export function validateOrderEditCommandResolution(raw: unknown): OrderEditCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.result === "unsupported") return { kind: "unsupported" };
  if (raw.result === "clarification_required") { const message = requiredText(raw.message); return message ? { kind: "clarification_required", message } : null; }
  if (raw.result !== "executable") return null;
  const reason = optionalText(raw, "reason"); if (reason === null) return null;
  switch (raw.action) {
    case "revise_quantity": { const orderItemId = requiredText(raw.orderItemId); if (!orderItemId || typeof raw.quantity !== "number" || !Number.isFinite(raw.quantity) || raw.quantity <= 0) return null; return { kind: "executable", command: { type: "revise_quantity", orderItemId, quantity: raw.quantity, ...(reason !== undefined ? { reason } : {}) } }; }
    case "revise_deadline": { if (raw.deadlineAt !== null && (typeof raw.deadlineAt !== "string" || Number.isNaN(new Date(raw.deadlineAt).valueOf()))) return null; return { kind: "executable", command: { type: "revise_deadline", deadlineAt: raw.deadlineAt as string | null, ...(reason !== undefined ? { reason } : {}) } }; }
    case "remove_item": { const orderItemId = requiredText(raw.orderItemId); if (!orderItemId) return null; return { kind: "executable", command: { type: "remove_item", orderItemId, ...(reason !== undefined ? { reason } : {}) } }; }
    case "record_exception": { if (typeof raw.category !== "string" || !(ORDER_EXCEPTION_CATEGORIES as readonly string[]).includes(raw.category)) return null; const note = optionalText(raw, "note"); if (note === null) return null; return { kind: "executable", command: { type: "record_exception", category: raw.category as OrderExceptionCategoryValue, ...(note !== undefined ? { note } : {}) } }; }
    case "transition_status": { if (typeof raw.toStatus !== "string" || !(ORDER_STATUSES as readonly string[]).includes(raw.toStatus)) return null; return { kind: "executable", command: { type: "transition_status", toStatus: raw.toStatus as OrderStatusValue, ...(reason !== undefined ? { reason } : {}) } }; }
    case "cancel": { const requiredReason = requiredText(raw.reason); return requiredReason ? { kind: "executable", command: { type: "cancel", reason: requiredReason } } : null; }
    default: return null;
  }
}

export function revalidateOrderEditCommandResolution(raw: unknown): OrderEditCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "unsupported") return { kind: "unsupported" };
  if (raw.kind === "clarification_required") { const message = requiredText(raw.message); return message ? { kind: "clarification_required", message } : null; }
  if (raw.kind !== "executable" || !isRecord(raw.command)) return null;
  return validateOrderEditCommandResolution({ result: "executable", action: raw.command.type, ...raw.command });
}
