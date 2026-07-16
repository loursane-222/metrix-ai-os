import { randomUUID } from "crypto";

import { AuditMutationNotAllowedError, AuditRecordNotFoundError } from "./audit.errors";
import type { AppendAuditRecordInput, AuditRecord, AuditStore } from "./audit.types";
import type { TargetEntityRef } from "../policy";

export type InMemoryAuditStoreOptions = {
  clock?: () => Date;
  generateId?: () => string;
};

function entityRefsEqual(a?: TargetEntityRef, b?: TargetEntityRef): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.entityType === b.entityType && a.entityId === b.entityId;
}

/**
 * Framework bağımsız in-memory implementasyon. Append-only: mevcut bir
 * kayıt asla overwrite edilemez veya silinemez. Düzeltmeler yeni bir
 * AuditRecord olarak eklenir; orijinal kayıt hiçbir zaman mutasyona
 * uğramaz — correctedByAuditId yalnızca linkCorrection() sonrası okuma
 * zamanında hesaplanan bir projeksiyondur.
 */
export function createInMemoryAuditStore(options: InMemoryAuditStoreOptions = {}): AuditStore {
  const clock = options.clock ?? (() => new Date());
  const generateId = options.generateId ?? (() => randomUUID());
  const records = new Map<string, AuditRecord>();
  const correctionLinks = new Map<string, string>();

  function project(record: AuditRecord): AuditRecord {
    const correctedByAuditId = correctionLinks.get(record.auditId);
    if (correctedByAuditId === undefined) {
      return record;
    }
    return Object.freeze({ ...record, correctedByAuditId });
  }

  return {
    append(input: AppendAuditRecordInput) {
      const auditId = input.auditId ?? generateId();

      if (records.has(auditId)) {
        throw new AuditMutationNotAllowedError(auditId, "append");
      }

      const record: AuditRecord = Object.freeze({
        auditId,
        recordType: input.recordType,
        actionName: input.actionName,
        actorId: input.actorId,
        organizationId: input.organizationId,
        entityRef: input.entityRef,
        executionId: input.executionId,
        operationId: input.operationId,
        policyDecisionRef: input.policyDecisionRef,
        approvalRef: input.approvalRef,
        outcome: input.outcome,
        reasonCode: input.reasonCode,
        inputHash: input.inputHash,
        resultSummary: input.resultSummary,
        correctsAuditId: input.correctsAuditId,
        timestamp: clock().toISOString(),
        metadata: Object.freeze({ ...(input.metadata ?? {}) }),
      });

      records.set(auditId, record);
      return record;
    },
    get(auditId) {
      const record = records.get(auditId);
      return record ? project(record) : undefined;
    },
    listByOrganization(organizationId) {
      return [...records.values()].filter((record) => record.organizationId === organizationId).map(project);
    },
    listByEntity(organizationId, entityRef) {
      return [...records.values()]
        .filter((record) => record.organizationId === organizationId && entityRefsEqual(record.entityRef, entityRef))
        .map(project);
    },
    listByExecution(executionId) {
      return [...records.values()].filter((record) => record.executionId === executionId).map(project);
    },
    listByOperation(operationId) {
      return [...records.values()].filter((record) => record.operationId === operationId).map(project);
    },
    linkCorrection(originalAuditId, correctionAuditId) {
      if (!records.has(originalAuditId)) {
        throw new AuditRecordNotFoundError(originalAuditId);
      }
      if (!records.has(correctionAuditId)) {
        throw new AuditRecordNotFoundError(correctionAuditId);
      }
      correctionLinks.set(originalAuditId, correctionAuditId);
    },
  };
}
