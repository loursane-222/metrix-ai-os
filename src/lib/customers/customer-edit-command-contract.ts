// Customer Edit Command Contract — the narrow, typed, allowlisted shape every
// natural-language edit command (written or voice) must resolve into before
// it is ever allowed to touch a mounted CustomerEditSurfaceRuntime. Nothing
// here talks to the AI provider, the runtime, or the network — this module
// only defines the contract and validates untyped input (model JSON output,
// or a payload that crossed the network) against it.

import { isRecord } from "@/lib/api/validation";

export const CUSTOMER_EDIT_COMMAND_TOP_FIELD_NAMES = [
  "displayName",
  "tier",
  "phone",
  "email",
  "legalName",
  "metrixNote",
  "cariKodu",
  "taxNumber",
  "taxOffice",
  "mersisNo",
  "tradeRegistryNo",
  "eInvoiceEnabled",
  "eArchiveEnabled",
  "status",
] as const;
export type CustomerEditCommandTopFieldName = (typeof CUSTOMER_EDIT_COMMAND_TOP_FIELD_NAMES)[number];

export const CUSTOMER_EDIT_COMMAND_ADDRESS_KINDS = ["billingAddress", "shippingAddress"] as const;
export type CustomerEditCommandAddressKind = (typeof CUSTOMER_EDIT_COMMAND_ADDRESS_KINDS)[number];

export const CUSTOMER_EDIT_COMMAND_ADDRESS_PROPERTY_NAMES = [
  "line1",
  "district",
  "city",
  "postalCode",
  "country",
] as const;
export type CustomerEditCommandAddressPropertyName = (typeof CUSTOMER_EDIT_COMMAND_ADDRESS_PROPERTY_NAMES)[number];

export const CUSTOMER_EDIT_COMMAND_TAB_IDS = ["identity", "official", "address", "financial", "system"] as const;
export type CustomerEditCommandTabId = (typeof CUSTOMER_EDIT_COMMAND_TAB_IDS)[number];

const BOOLEAN_FIELD_NAMES = new Set<string>(["eInvoiceEnabled", "eArchiveEnabled"]);
const STATUS_VALUES = new Set(["ACTIVE", "PASSIVE", "BLOCKED"]);

export type CustomerEditCommandFieldPath =
  | { kind: "top"; field: CustomerEditCommandTopFieldName }
  | { kind: "address"; addressKind: CustomerEditCommandAddressKind; property: CustomerEditCommandAddressPropertyName };

export type CustomerEditCommand =
  | { type: "set_field"; field: CustomerEditCommandFieldPath; value: string | boolean }
  | { type: "clear_field"; field: CustomerEditCommandFieldPath }
  | { type: "revert_field"; field: CustomerEditCommandFieldPath }
  | { type: "select_tab"; tabId: CustomerEditCommandTabId }
  | { type: "commit" }
  | { type: "discard" };

export type CustomerEditCommandResolution =
  | { kind: "executable"; command: CustomerEditCommand }
  | { kind: "unsupported" }
  | { kind: "clarification_required"; message: string };

/** Runtime-adapter-facing execution outcome — the Result Contract every dispatch path returns. */
export type CustomerEditCommandExecutionResult =
  | {
      status: "EXECUTED";
      command: CustomerEditCommand;
      appliedField?: string;
      appliedValue?: unknown;
      commitOutcome?: "SAVED" | "SAVED_REFRESH_FAILED";
      revertedFields?: string[];
    }
  | { status: "UNSUPPORTED" }
  | { status: "CLARIFICATION_REQUIRED"; message: string }
  | { status: "NO_ACTIVE_SURFACE" }
  | { status: "STALE_SURFACE" }
  | { status: "VALIDATION_FAILED"; reason: string }
  | { status: "EXECUTION_FAILED"; error: string };

export function parseCustomerEditCommandFieldPath(raw: unknown): CustomerEditCommandFieldPath | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  if (!raw.includes(".")) {
    return (CUSTOMER_EDIT_COMMAND_TOP_FIELD_NAMES as readonly string[]).includes(raw)
      ? { kind: "top", field: raw as CustomerEditCommandTopFieldName }
      : null;
  }

  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [addressKind, property] = parts as [string, string];

  if (!(CUSTOMER_EDIT_COMMAND_ADDRESS_KINDS as readonly string[]).includes(addressKind)) return null;
  if (!(CUSTOMER_EDIT_COMMAND_ADDRESS_PROPERTY_NAMES as readonly string[]).includes(property)) return null;

  return {
    kind: "address",
    addressKind: addressKind as CustomerEditCommandAddressKind,
    property: property as CustomerEditCommandAddressPropertyName,
  };
}

function isValidFieldValue(field: CustomerEditCommandFieldPath, value: unknown): value is string | boolean {
  if (field.kind === "top" && BOOLEAN_FIELD_NAMES.has(field.field)) {
    return typeof value === "boolean";
  }
  if (field.kind === "top" && field.field === "status") {
    return typeof value === "string" && STATUS_VALUES.has(value);
  }
  return typeof value === "string";
}

/**
 * Strict schema validation boundary for the model's (or the network's) raw
 * output. Anything that doesn't exactly match one of the allowlisted shapes
 * below — an unknown field/tab/action name, a wrong value type, a malformed
 * object — returns null. Callers must treat null as "reject", never as
 * "unsupported" (that is a distinct, model-declared outcome, not a shape
 * failure) — see CustomerEditCommandResolveOutcome in the resolver module.
 */
export function validateCustomerEditCommandResolution(raw: unknown): CustomerEditCommandResolution | null {
  if (!isRecord(raw)) return null;

  const result = raw.result;

  if (result === "unsupported") {
    return { kind: "unsupported" };
  }

  if (result === "clarification_required") {
    const message = raw.message;
    if (typeof message !== "string" || message.trim().length === 0) return null;
    return { kind: "clarification_required", message: message.trim() };
  }

  if (result !== "executable") return null;

  const action = raw.action;

  switch (action) {
    case "select_tab": {
      const tabId = raw.tabId;
      if (typeof tabId !== "string" || !(CUSTOMER_EDIT_COMMAND_TAB_IDS as readonly string[]).includes(tabId)) {
        return null;
      }
      return { kind: "executable", command: { type: "select_tab", tabId: tabId as CustomerEditCommandTabId } };
    }

    case "commit":
      return { kind: "executable", command: { type: "commit" } };

    case "discard":
      return { kind: "executable", command: { type: "discard" } };

    case "set_field": {
      const field = parseCustomerEditCommandFieldPath(raw.field);
      if (!field) return null;
      if (!("value" in raw) || !isValidFieldValue(field, raw.value)) return null;
      return { kind: "executable", command: { type: "set_field", field, value: raw.value as string | boolean } };
    }

    case "clear_field": {
      const field = parseCustomerEditCommandFieldPath(raw.field);
      if (!field) return null;
      return { kind: "executable", command: { type: "clear_field", field } };
    }

    case "revert_field": {
      const field = parseCustomerEditCommandFieldPath(raw.field);
      if (!field) return null;
      return { kind: "executable", command: { type: "revert_field", field } };
    }

    default:
      return null;
  }
}

export function customerEditCommandFieldPathToString(field: CustomerEditCommandFieldPath): string {
  return field.kind === "top" ? field.field : `${field.addressKind}.${field.property}`;
}

function revalidateFieldPathShape(raw: unknown): CustomerEditCommandFieldPath | null {
  if (!isRecord(raw)) return null;

  if (raw.kind === "top") {
    const field = raw.field;
    return typeof field === "string" && (CUSTOMER_EDIT_COMMAND_TOP_FIELD_NAMES as readonly string[]).includes(field)
      ? { kind: "top", field: field as CustomerEditCommandTopFieldName }
      : null;
  }

  if (raw.kind === "address") {
    const addressKind = raw.addressKind;
    const property = raw.property;
    if (typeof addressKind !== "string" || !(CUSTOMER_EDIT_COMMAND_ADDRESS_KINDS as readonly string[]).includes(addressKind)) {
      return null;
    }
    if (
      typeof property !== "string" ||
      !(CUSTOMER_EDIT_COMMAND_ADDRESS_PROPERTY_NAMES as readonly string[]).includes(property)
    ) {
      return null;
    }
    return {
      kind: "address",
      addressKind: addressKind as CustomerEditCommandAddressKind,
      property: property as CustomerEditCommandAddressPropertyName,
    };
  }

  return null;
}

/**
 * Re-validates an already-typed CustomerEditCommandResolution after it has
 * crossed the network as JSON (server -> client). This is a distinct shape
 * from the model's raw output (`{result, action, field, value, tabId}` —
 * see validateCustomerEditCommandResolution above): the server has already
 * turned that into `{kind, command}` before sending it. Used only at the
 * client boundary as defense-in-depth — never trusts that the server's own
 * validation survived the wire unmodified.
 */
export function revalidateCustomerEditCommandResolution(raw: unknown): CustomerEditCommandResolution | null {
  if (!isRecord(raw)) return null;

  const kind = raw.kind;

  if (kind === "unsupported") return { kind: "unsupported" };

  if (kind === "clarification_required") {
    const message = raw.message;
    if (typeof message !== "string" || message.trim().length === 0) return null;
    return { kind: "clarification_required", message: message.trim() };
  }

  if (kind !== "executable" || !isRecord(raw.command)) return null;

  const command = raw.command;
  const type = command.type;

  switch (type) {
    case "select_tab": {
      const tabId = command.tabId;
      if (typeof tabId !== "string" || !(CUSTOMER_EDIT_COMMAND_TAB_IDS as readonly string[]).includes(tabId)) {
        return null;
      }
      return { kind: "executable", command: { type: "select_tab", tabId: tabId as CustomerEditCommandTabId } };
    }

    case "commit":
      return { kind: "executable", command: { type: "commit" } };

    case "discard":
      return { kind: "executable", command: { type: "discard" } };

    case "set_field": {
      const field = revalidateFieldPathShape(command.field);
      if (!field) return null;
      if (!("value" in command) || !isValidFieldValue(field, command.value)) return null;
      return { kind: "executable", command: { type: "set_field", field, value: command.value as string | boolean } };
    }

    case "clear_field": {
      const field = revalidateFieldPathShape(command.field);
      if (!field) return null;
      return { kind: "executable", command: { type: "clear_field", field } };
    }

    case "revert_field": {
      const field = revalidateFieldPathShape(command.field);
      if (!field) return null;
      return { kind: "executable", command: { type: "revert_field", field } };
    }

    default:
      return null;
  }
}
