// Offer Edit Command Contract — the narrow, typed, allowlisted shape every
// natural-language edit command must resolve into before it is ever allowed
// to touch a mounted OfferEditSurfaceRuntime. Mirrors
// customer-edit-command-contract.ts exactly: nothing here talks to the AI
// provider, the runtime, or the network — this module only defines the
// contract and validates untyped input against it.

import { isRecord } from "@/lib/api/validation";
import { OFFER_EDIT_FIELDS } from "./offer-field-registry";

export type OfferEditCommandFieldName = "customerNote" | "validUntil" | "paymentTerm" | "deliveryTerm" | "deliveryMethod";
export const OFFER_EDIT_COMMAND_FIELD_NAMES: readonly OfferEditCommandFieldName[] = OFFER_EDIT_FIELDS.map(
  (field) => field.key as OfferEditCommandFieldName,
);

export const OFFER_EDIT_COMMAND_TAB_IDS = ["items", "terms", "notes"] as const;
export type OfferEditCommandTabId = (typeof OFFER_EDIT_COMMAND_TAB_IDS)[number];

export type OfferEditCommand =
  | { type: "add_item"; name: string; quantity: number; unitPrice: number; unit?: string; discountPercent?: number; vatPercent?: number }
  | { type: "remove_last_item" }
  | { type: "set_item_price"; unitPrice: number; itemName?: string }
  | { type: "set_general_discount"; percent: number }
  | { type: "set_field"; field: OfferEditCommandFieldName; value: string }
  | { type: "select_tab"; tabId: OfferEditCommandTabId }
  | { type: "commit" }
  | { type: "discard" };

export type OfferEditCommandResolution =
  | { kind: "executable"; command: OfferEditCommand }
  | { kind: "unsupported" }
  | { kind: "clarification_required"; message: string };

export type OfferEditCommandExecutionResult =
  | { status: "EXECUTED"; command: OfferEditCommand; commitOutcome?: "SAVED" | "SAVED_REFRESH_FAILED" }
  | { status: "UNSUPPORTED" }
  | { status: "CLARIFICATION_REQUIRED"; message: string }
  | { status: "NO_ACTIVE_SURFACE" }
  | { status: "STALE_SURFACE" }
  | { status: "VALIDATION_FAILED"; reason: string }
  | { status: "EXECUTION_FAILED"; error: string };

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Strict schema validation boundary for the model's (or the network's) raw
 * output — bkz. validateCustomerEditCommandResolution aynı desen. Anything
 * that doesn't exactly match one of the allowlisted shapes returns null.
 */
export function validateOfferEditCommandResolution(raw: unknown): OfferEditCommandResolution | null {
  if (!isRecord(raw)) return null;

  const result = raw.result;

  if (result === "unsupported") return { kind: "unsupported" };

  if (result === "clarification_required") {
    const message = raw.message;
    if (typeof message !== "string" || message.trim().length === 0) return null;
    return { kind: "clarification_required", message: message.trim() };
  }

  if (result !== "executable") return null;

  const action = raw.action;

  switch (action) {
    case "add_item": {
      const name = raw.name;
      if (typeof name !== "string" || name.trim().length === 0) return null;
      if (!isPositiveNumber(raw.quantity) || !isNonNegativeNumber(raw.unitPrice)) return null;
      const unit = "unit" in raw ? raw.unit : undefined;
      if (unit !== undefined && typeof unit !== "string") return null;
      const discountPercent = "discountPercent" in raw ? raw.discountPercent : undefined;
      if (discountPercent !== undefined && !isNonNegativeNumber(discountPercent)) return null;
      const vatPercent = "vatPercent" in raw ? raw.vatPercent : undefined;
      if (vatPercent !== undefined && !isNonNegativeNumber(vatPercent)) return null;
      return {
        kind: "executable",
        command: {
          type: "add_item",
          name: name.trim(),
          quantity: raw.quantity,
          unitPrice: raw.unitPrice,
          ...(unit !== undefined ? { unit } : {}),
          ...(discountPercent !== undefined ? { discountPercent } : {}),
          ...(vatPercent !== undefined ? { vatPercent } : {}),
        },
      };
    }

    case "remove_last_item":
      return { kind: "executable", command: { type: "remove_last_item" } };

    case "set_item_price": {
      if (!isNonNegativeNumber(raw.unitPrice)) return null;
      const itemName = "itemName" in raw ? raw.itemName : undefined;
      if (itemName !== undefined && typeof itemName !== "string") return null;
      return { kind: "executable", command: { type: "set_item_price", unitPrice: raw.unitPrice, ...(itemName !== undefined ? { itemName } : {}) } };
    }

    case "set_general_discount": {
      if (!isNonNegativeNumber(raw.percent)) return null;
      return { kind: "executable", command: { type: "set_general_discount", percent: raw.percent } };
    }

    case "set_field": {
      const field = raw.field;
      if (typeof field !== "string" || !(OFFER_EDIT_COMMAND_FIELD_NAMES as readonly string[]).includes(field)) return null;
      const value = raw.value;
      if (typeof value !== "string") return null;
      return { kind: "executable", command: { type: "set_field", field: field as OfferEditCommandFieldName, value } };
    }

    case "select_tab": {
      const tabId = raw.tabId;
      if (typeof tabId !== "string" || !(OFFER_EDIT_COMMAND_TAB_IDS as readonly string[]).includes(tabId)) return null;
      return { kind: "executable", command: { type: "select_tab", tabId: tabId as OfferEditCommandTabId } };
    }

    case "commit":
      return { kind: "executable", command: { type: "commit" } };

    case "discard":
      return { kind: "executable", command: { type: "discard" } };

    default:
      return null;
  }
}

/** Re-validates an already-typed resolution after it crossed the network as JSON — bkz. revalidateCustomerEditCommandResolution aynı desen, defense-in-depth. */
export function revalidateOfferEditCommandResolution(raw: unknown): OfferEditCommandResolution | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;
  if (kind === "unsupported") return { kind: "unsupported" };
  if (kind === "clarification_required") {
    const message = raw.message;
    if (typeof message !== "string" || message.trim().length === 0) return null;
    return { kind: "clarification_required", message: message.trim() };
  }
  if (kind !== "executable" || !isRecord(raw.command)) return null;
  // The command shape is identical to the model's raw `{result:"executable", action, ...}` form
  // minus the `result` wrapper, so reuse the same validator by re-wrapping it.
  return validateOfferEditCommandResolution({ result: "executable", action: raw.command.type, ...raw.command });
}
