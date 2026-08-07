import type { ExecutiveMindRuntimeStateRecord } from "@prisma/client";

import {
  findExecutiveMindRuntimeStateRecord,
  upsertExecutiveMindRuntimeStateRecord,
} from "./executive-mind-runtime.repository";
import {
  EXECUTIVE_MIND_RUNTIME_STATE_VERSION,
  type ExecutiveMindProposition,
  type ExecutiveMindRuntimeState,
  type ExecutiveMindValidationLevel,
  type ExecutiveMindWorkingMemoryItem,
  type PutExecutiveMindRuntimeStateInput,
} from "./executive-mind-runtime.types";

export async function getExecutiveMindRuntimeState(
  organizationId: string,
): Promise<ExecutiveMindRuntimeState | null> {
  const record = await findExecutiveMindRuntimeStateRecord(organizationId);
  return record ? mapRecord(record) : null;
}

export async function putExecutiveMindRuntimeState(
  input: PutExecutiveMindRuntimeStateInput,
): Promise<ExecutiveMindRuntimeState> {
  validateInput(input);
  return mapRecord(await upsertExecutiveMindRuntimeStateRecord(input));
}

function mapRecord(record: ExecutiveMindRuntimeStateRecord): ExecutiveMindRuntimeState {
  return {
    stateVersion: EXECUTIVE_MIND_RUNTIME_STATE_VERSION,
    organizationId: record.organizationId,
    attentionFocus: record.attentionFocus,
    workingMemory: readWorkingMemory(record.workingMemoryJson),
    hypotheses: readPropositions(record.hypothesesJson),
    beliefs: readPropositions(record.beliefsJson),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function validateInput(input: PutExecutiveMindRuntimeStateInput): void {
  if (!input.organizationId.trim()) throw new Error("organizationId is required.");
  if (input.attentionFocus !== null && !input.attentionFocus.trim()) {
    throw new Error("attentionFocus must be null or non-empty.");
  }
  if (!input.workingMemory.every(isWorkingMemoryItem)) {
    throw new Error("workingMemory contains an invalid item.");
  }
  if (![...input.hypotheses, ...input.beliefs].every(isProposition)) {
    throw new Error("hypotheses or beliefs contains an invalid item.");
  }
}

function readWorkingMemory(value: unknown): ExecutiveMindWorkingMemoryItem[] {
  return Array.isArray(value) ? value.filter(isWorkingMemoryItem) : [];
}

function readPropositions(value: unknown): ExecutiveMindProposition[] {
  return Array.isArray(value) ? value.filter(isProposition) : [];
}

function isWorkingMemoryItem(value: unknown): value is ExecutiveMindWorkingMemoryItem {
  if (!isObject(value)) return false;
  return nonEmpty(value.key) && nonEmpty(value.value) && isoDate(value.loadedAt);
}

function isProposition(value: unknown): value is ExecutiveMindProposition {
  if (!isObject(value)) return false;
  return nonEmpty(value.id)
    && nonEmpty(value.summary)
    && validationLevel(value.validationLevel)
    && isoDate(value.observedAt)
    && isoDate(value.updatedAt);
}

function validationLevel(value: unknown): value is ExecutiveMindValidationLevel {
  return value === "UNVERIFIED"
    || value === "SUPPORTED"
    || value === "VERIFIED"
    || value === "REJECTED";
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isoDate(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
