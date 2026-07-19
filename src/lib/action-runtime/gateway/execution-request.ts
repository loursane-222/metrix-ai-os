import { createHash } from "crypto";

import type { ExecutionContext } from "../execution";
import type { ApprovalGrant, RuntimeRiskContext, TargetEntityRef } from "../policy";
import type { ActionExecutionRequest } from "../execution";

/**
 * Object key sırasından etkilenmeyen canonical serialization. undefined
 * değerler (obje alanlarında) yok sayılır — bir alanın "belirtilmemiş"
 * olması ile "belirtilmiş ama undefined" olması arasında hash açısından
 * fark yoktur; bu, deterministik ve tekrarlanabilir bir davranıştır.
 */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) continue;
      result[key] = canonicalize(entry);
    }
    return result;
  }

  return value;
}

export type NormalizedInputHashInput = {
  actionName: string;
  input: Record<string, unknown>;
  entityRef?: TargetEntityRef;
};

/**
 * Server tarafında deterministik normalizedInputHash üretir. Ham hassas
 * girdi değerleri hiçbir yerde loglanmaz veya response'a konmaz — yalnızca
 * bu tek yönlü hash Execution Runtime'a ve Policy Engine'e taşınır.
 */
export function computeNormalizedInputHash(input: NormalizedInputHashInput): string {
  const canonicalPayload = stableSerialize({
    actionName: input.actionName,
    input: input.input,
    entityRef: input.entityRef ?? null,
  });

  return createHash("sha256").update(canonicalPayload).digest("hex");
}

export type BuildActionExecutionRequestInput = {
  actionName: string;
  input: Record<string, unknown>;
  executionContext: ExecutionContext;
  entityRef?: TargetEntityRef;
  idempotencyKey: string;
  correlationId: string;
  runtimeRiskContext?: RuntimeRiskContext;
  approvalGrant?: ApprovalGrant;
};

/** ActionExecutionRequest'i, normalizedInputHash'i kendi hesaplayarak üretir. */
export function buildActionExecutionRequest(input: BuildActionExecutionRequestInput): ActionExecutionRequest {
  return {
    actionName: input.actionName,
    input: input.input,
    executionContext: input.executionContext,
    entityRef: input.entityRef,
    idempotencyKey: input.idempotencyKey,
    normalizedInputHash: computeNormalizedInputHash({
      actionName: input.actionName,
      input: input.input,
      entityRef: input.entityRef,
    }),
    correlationId: input.correlationId,
    runtimeRiskContext: input.runtimeRiskContext,
    approvalGrant: input.approvalGrant,
  };
}
