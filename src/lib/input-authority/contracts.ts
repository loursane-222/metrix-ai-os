import type { ModuleFieldDefinition, ModuleFieldValueType } from "@/lib/field-authority/field-authority";

export const UNIVERSAL_INPUT_TARGET_KINDS = ["page", "surface", "section", "field", "selection", "attachment", "action"] as const;
export type UniversalInputTargetKind = (typeof UNIVERSAL_INPUT_TARGET_KINDS)[number];
export const UNIVERSAL_INPUT_FIELD_TYPES = ["text", "multiline", "phone", "email", "integer", "number", "money", "percentage", "boolean", "date", "datetime", "enum", "address", "contact", "json", "file", "image", "document", "lookup", "entity_picker", "multi_select", "editable_grid", "custom"] as const;
export type UniversalInputFieldType = (typeof UNIVERSAL_INPUT_FIELD_TYPES)[number];
export type UniversalInputValidation = { state?: "unknown" | "valid" | "invalid" | "missing"; message?: string; min?: number; max?: number; pattern?: string; options?: readonly string[] };
export type UniversalInputAttachmentAcceptance = { mediaTypes: readonly string[]; extensions?: readonly string[]; maxBytes?: number; multiple: boolean };
export type UniversalInputTargetDescriptor = Readonly<{
  executiveTargetId: string; authorityKey: string; targetKind: UniversalInputTargetKind; module: string; entityType?: string; entityId?: string;
  fieldId?: string; fieldType?: UniversalInputFieldType; label: string; description?: string; parentTargetId?: string; sectionId?: string; surfaceId?: string;
  required?: boolean; readable?: boolean; mutable?: boolean; clearable?: boolean; focusable?: boolean; selectable?: boolean; supportsVoice?: boolean; supportsDraft?: boolean;
  supportsApproval?: boolean; approvalPolicy?: ModuleFieldDefinition["approvalPolicy"]; riskLevel?: ModuleFieldDefinition["riskLevel"];
  permissionRead?: string; permissionWrite?: string | null; validation?: UniversalInputValidation; actionName?: string; draftActionName?: string; commitActionName?: string;
  attachmentAcceptance?: UniversalInputAttachmentAcceptance; aliases?: readonly string[]; order?: number; visibility?: "visible" | "hidden"; disabled?: boolean; readOnly?: boolean;
}>;
export type UniversalInputValidationResult = Readonly<{ valid: boolean; message?: string; missing?: boolean }>;
export type UniversalInputAttachment = Readonly<{ name: string; mediaType: string; size: number; payload: unknown }>;
export type UniversalInputTargetRuntimeAdapter = Readonly<{
  read?: () => unknown | Promise<unknown>; set?: (value: unknown) => unknown | Promise<unknown>; clear?: () => unknown | Promise<unknown>;
  focus?: () => void | Promise<void>; reveal?: () => void | Promise<void>; validate?: () => UniversalInputValidationResult | Promise<UniversalInputValidationResult>;
  select?: (value: unknown) => unknown | Promise<unknown>; open?: () => void | Promise<void>; close?: () => void | Promise<void>;
  commit?: () => unknown | Promise<unknown>; cancel?: () => unknown | Promise<unknown>; createDraft?: () => unknown | Promise<unknown>;
  receiveAttachment?: (attachment: UniversalInputAttachment) => unknown | Promise<unknown>;
}>;
export type UniversalInputRegistration = Readonly<{ registrationToken: string; generation: number; descriptor: UniversalInputTargetDescriptor; adapter: UniversalInputTargetRuntimeAdapter; mountedAt: string; updatedAt: string }>;

export type UniversalInputDiscoverySnapshot = Readonly<{ snapshotId: number; generatedAt: string; activePage: UniversalInputTargetDescriptor | null; activeSurfaces: readonly UniversalInputTargetDescriptor[]; sections: readonly UniversalInputTargetDescriptor[]; fields: readonly UniversalInputTargetDescriptor[]; selections: readonly UniversalInputTargetDescriptor[]; attachments: readonly UniversalInputTargetDescriptor[]; actions: readonly UniversalInputTargetDescriptor[]; validation: Readonly<{ valid: number; invalid: number; missing: number; unknown: number }>; writableTargetCount: number; invalidTargetCount: number; requiredMissingTargetCount: number }>;
export type UniversalInputCommandType = "DISCOVER" | "READ" | "SET" | "CLEAR" | "FOCUS" | "REVEAL" | "VALIDATE" | "SELECT" | "OPEN" | "CLOSE" | "COMMIT" | "CANCEL" | "CREATE_DRAFT" | "RECEIVE_ATTACHMENT";
export type UniversalInputAuthorityCommand = Readonly<{ type: UniversalInputCommandType; executiveTargetId?: string; authorityKey?: string; expectedRegistrationToken?: string; expectedGeneration?: number; value?: unknown; attachment?: UniversalInputAttachment }>;
export type UniversalInputExecutionStatus = "EXECUTED" | "DISCOVERED" | "NOT_FOUND" | "AMBIGUOUS_TARGET" | "CAPABILITY_UNAVAILABLE" | "STALE_TARGET" | "READ_ONLY" | "VALIDATION_FAILED" | "APPROVAL_REQUIRED" | "DRAFT_CREATED" | "CANCELLED" | "EXECUTION_FAILED";
export type UniversalInputAuthorityExecutionResult = Readonly<{ status: UniversalInputExecutionStatus; descriptor?: UniversalInputTargetDescriptor; registrationToken?: string; generation?: number; value?: unknown; discovery?: UniversalInputDiscoverySnapshot; validation?: UniversalInputValidationResult; error?: string }>;

const FIELD_TYPE_MAP: Record<ModuleFieldValueType, UniversalInputFieldType> = { string: "text", multiline_string: "multiline", phone: "phone", email: "email", integer: "integer", money: "money", percentage: "percentage", boolean: "boolean", date: "date", datetime: "datetime", enum: "enum", address: "address", contact: "contact", json: "json" };
export function mapModuleFieldValueType(valueType: ModuleFieldValueType): UniversalInputFieldType { return FIELD_TYPE_MAP[valueType]; }
