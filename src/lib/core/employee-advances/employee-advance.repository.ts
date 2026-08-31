import type { EmployeeAdvance, EmployeeAdvanceMovement, EmployeeAdvanceReconciliation, EmployeeAdvanceStatus, FinancialAccountMovement, MoneyDirection, PaymentMethod, Prisma, SettlementKind } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateEmployeeAdvanceInput } from "./employee-advance.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export function createEmployeeAdvance(input: CreateEmployeeAdvanceInput, tx: PrismaTransactionClient): Promise<EmployeeAdvance> {
  return tx.employeeAdvance.create({
    data: {
      organizationId: input.organizationId,
      employeeMemberId: input.employeeMemberId,
      amount: input.amount,
      currency: input.currency ?? "TRY",
      status: "OUTSTANDING",
      note: input.note ?? null,
      actorId: input.actorId,
    },
  });
}

export function findEmployeeAdvanceById(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<EmployeeAdvance | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.employeeAdvance.findFirst({ where: { id, organizationId } });
}

export function listEmployeeAdvances(organizationId: string, status?: EmployeeAdvanceStatus): Promise<EmployeeAdvance[]> {
  return prisma.employeeAdvance.findMany({ where: { organizationId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" } });
}

export type CreateAdvanceMovementInput = {
  organizationId: string;
  employeeAdvanceId: string;
  kind: SettlementKind;
  direction: MoneyDirection;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  financialAccountId: string;
  occurredAt: Date;
  idempotencyKey: string | null;
  requestHash: string | null;
  reason: string | null;
  actorId: string;
  reversalOfId?: string;
};

export function createAdvanceMovement(input: CreateAdvanceMovementInput, tx: PrismaTransactionClient): Promise<EmployeeAdvanceMovement> {
  return tx.employeeAdvanceMovement.create({ data: input });
}

export function findAdvanceMovementByIdempotencyKey(organizationId: string, employeeAdvanceId: string, idempotencyKey: string, tx?: PrismaTransactionClient): Promise<EmployeeAdvanceMovement | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.employeeAdvanceMovement.findFirst({ where: { organizationId, employeeAdvanceId, idempotencyKey } });
}

export function findAdvanceMovementByReversalOfId(organizationId: string, reversalOfId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.employeeAdvanceMovement.findFirst({ where: { organizationId, reversalOfId }, include: { movement: true } });
}

export function findAdvanceMovementForReversal(organizationId: string, id: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.employeeAdvanceMovement.findFirst({ where: { id, organizationId }, include: { movement: true, reversal: true } });
}

export type CreateAdvanceFinancialMovementInput = {
  organizationId: string;
  financialAccountId: string;
  employeeAdvanceMovementId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  occurredAt: Date;
  direction: MoneyDirection;
  provenance: Prisma.InputJsonValue;
  reversalOfId?: string;
};

export function createAdvanceFinancialMovement(input: CreateAdvanceFinancialMovementInput, tx: PrismaTransactionClient): Promise<FinancialAccountMovement> {
  return tx.financialAccountMovement.create({ data: input });
}

/** net(OUT) - net(IN) alanları ayrı ayrı: disbursed_total ve returned_total. */
export async function sumNetAdvanceMovementsByDirection(organizationId: string, employeeAdvanceId: string, direction: MoneyDirection, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.employeeAdvanceMovement.aggregate({ where: { organizationId, employeeAdvanceId, direction, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.employeeAdvanceMovement.aggregate({ where: { organizationId, employeeAdvanceId, direction, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}

export type CreateAdvanceReconciliationInput = {
  organizationId: string;
  employeeAdvanceId: string;
  expenseId: string;
  kind: SettlementKind;
  amount: number;
  currency: string;
  occurredAt: Date;
  idempotencyKey: string | null;
  reason: string | null;
  actorId: string;
  reversalOfId?: string;
};

export function createAdvanceReconciliation(input: CreateAdvanceReconciliationInput, tx: PrismaTransactionClient): Promise<EmployeeAdvanceReconciliation> {
  return tx.employeeAdvanceReconciliation.create({ data: input });
}

export function findAdvanceReconciliationByIdempotencyKey(organizationId: string, employeeAdvanceId: string, expenseId: string, idempotencyKey: string, tx?: PrismaTransactionClient): Promise<EmployeeAdvanceReconciliation | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.employeeAdvanceReconciliation.findFirst({ where: { organizationId, employeeAdvanceId, expenseId, idempotencyKey } });
}

export function findAdvanceReconciliationByReversalOfId(organizationId: string, reversalOfId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.employeeAdvanceReconciliation.findFirst({ where: { organizationId, reversalOfId } });
}

export function findAdvanceReconciliationForReversal(organizationId: string, id: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.employeeAdvanceReconciliation.findFirst({ where: { id, organizationId }, include: { reversal: true } });
}

export async function sumNetAdvanceReconciliations(organizationId: string, employeeAdvanceId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.employeeAdvanceReconciliation.aggregate({ where: { organizationId, employeeAdvanceId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.employeeAdvanceReconciliation.aggregate({ where: { organizationId, employeeAdvanceId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}

/**
 * §Obligation integrity — bir Expense'in ne kadarının HALEN uzlaşılmamış
 * bir avansla karşılandığını verir; ExpenseSettlement (gerçek nakit) hiç
 * dokunulmaz. financial-instrument.repository.ts::sumNetAllocationsForObligation
 * ile aynı prensip.
 */
export async function sumNetReconciliationsForExpense(organizationId: string, expenseId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.employeeAdvanceReconciliation.aggregate({ where: { organizationId, expenseId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.employeeAdvanceReconciliation.aggregate({ where: { organizationId, expenseId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}

export function updateEmployeeAdvanceProjection(input: { id: string; organizationId: string; reconciledAmount: number; status: EmployeeAdvanceStatus }, tx: PrismaTransactionClient): Promise<EmployeeAdvance> {
  return tx.employeeAdvance.update({ where: { id: input.id }, data: { reconciledAmount: input.reconciledAmount, status: input.status } });
}
