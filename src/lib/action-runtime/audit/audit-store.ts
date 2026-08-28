import { randomUUID } from "crypto";

import type { AuditRecord as AuditRecordRow, Prisma, PrismaClient } from "@prisma/client";

import { AuditMutationNotAllowedError, AuditRecordNotFoundError } from "./audit.errors";
import type { AppendAuditRecordInput, AuditRecord, AuditOutcome, AuditRecordType, AuditStore } from "./audit.types";
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
    async append(input: AppendAuditRecordInput) {
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
    async get(auditId) {
      const record = records.get(auditId);
      return record ? project(record) : undefined;
    },
    async listByOrganization(organizationId) {
      return [...records.values()].filter((record) => record.organizationId === organizationId).map(project);
    },
    async listByEntity(organizationId, entityRef) {
      return [...records.values()]
        .filter((record) => record.organizationId === organizationId && entityRefsEqual(record.entityRef, entityRef))
        .map(project);
    },
    async listByExecution(executionId) {
      return [...records.values()].filter((record) => record.executionId === executionId).map(project);
    },
    async listByOperation(operationId) {
      return [...records.values()].filter((record) => record.operationId === operationId).map(project);
    },
    async linkCorrection(originalAuditId, correctionAuditId) {
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

type AuditPrismaClient = Pick<PrismaClient, "auditRecord">;
type AuditPrismaClientSource = AuditPrismaClient | (() => Promise<AuditPrismaClient>);

/**
 * Kalıcı, Prisma-backed implementasyon (bkz. index.ts'deki production
 * singleton). Serverless cold start'lar arasında hayatta kalır — eski
 * in-memory implementasyon her yeni fonksiyon instance'ında sıfırlanıyordu.
 */
export function createPrismaAuditStore(source: AuditPrismaClientSource): AuditStore {
  const getClient = async () => typeof source === "function" ? source() : source;
  return {
    async append(input) {
      const client = await getClient();
      const row = await client.auditRecord.create({
        data: {
          id: input.auditId,
          organizationId: input.organizationId,
          recordType: input.recordType,
          actionName: input.actionName,
          actorId: input.actorId,
          entityType: input.entityRef?.entityType,
          entityId: input.entityRef?.entityId,
          executionId: input.executionId,
          operationId: input.operationId,
          policyDecisionRef: input.policyDecisionRef,
          approvalRef: input.approvalRef,
          outcome: input.outcome,
          reasonCode: input.reasonCode,
          inputHash: input.inputHash,
          resultSummary: input.resultSummary,
          correctsAuditId: input.correctsAuditId,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      return mapRow(row);
    },
    async get(auditId) {
      const client = await getClient();
      const row = await client.auditRecord.findUnique({ where: { id: auditId } });
      return row ? mapRow(row) : undefined;
    },
    async listByOrganization(organizationId) {
      const client = await getClient();
      const rows = await client.auditRecord.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
      return rows.map(mapRow);
    },
    async listByEntity(organizationId, entityRef) {
      const client = await getClient();
      const rows = await client.auditRecord.findMany({
        where: { organizationId, entityType: entityRef.entityType, entityId: entityRef.entityId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapRow);
    },
    async listByExecution(executionId) {
      const client = await getClient();
      const rows = await client.auditRecord.findMany({ where: { executionId }, orderBy: { createdAt: "desc" } });
      return rows.map(mapRow);
    },
    async listByOperation(operationId) {
      const client = await getClient();
      const rows = await client.auditRecord.findMany({ where: { operationId }, orderBy: { createdAt: "desc" } });
      return rows.map(mapRow);
    },
    async linkCorrection(originalAuditId, correctionAuditId) {
      const client = await getClient();
      const [original, correction] = await Promise.all([
        client.auditRecord.findUnique({ where: { id: originalAuditId } }),
        client.auditRecord.findUnique({ where: { id: correctionAuditId } }),
      ]);
      if (!original) throw new AuditRecordNotFoundError(originalAuditId);
      if (!correction) throw new AuditRecordNotFoundError(correctionAuditId);
      await client.auditRecord.update({ where: { id: originalAuditId }, data: { correctedByAuditId: correctionAuditId } });
    },
  };
}

function mapRow(row: AuditRecordRow): AuditRecord {
  return Object.freeze({
    auditId: row.id,
    recordType: row.recordType as AuditRecordType,
    actionName: row.actionName,
    actorId: row.actorId,
    organizationId: row.organizationId,
    entityRef: row.entityType && row.entityId ? { entityType: row.entityType, entityId: row.entityId } : undefined,
    executionId: row.executionId ?? undefined,
    operationId: row.operationId ?? undefined,
    policyDecisionRef: row.policyDecisionRef ?? undefined,
    approvalRef: row.approvalRef ?? undefined,
    outcome: row.outcome as AuditOutcome,
    reasonCode: row.reasonCode ?? undefined,
    inputHash: row.inputHash ?? undefined,
    resultSummary: row.resultSummary ?? undefined,
    correctsAuditId: row.correctsAuditId ?? undefined,
    correctedByAuditId: row.correctedByAuditId ?? undefined,
    timestamp: row.createdAt.toISOString(),
    metadata: Object.freeze({ ...(row.metadata as Record<string, unknown> ?? {}) }),
  });
}
