import type { FinancialAccountMovement, Loan, LoanDrawdown, LoanInstallment, LoanRepayment, LoanStatus, MoneyDirection, PaymentMethod, Prisma, SettlementKind } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreateLoanInput } from "./loan.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createLoanWithInstallments(input: CreateLoanInput, tx: PrismaTransactionClient): Promise<{ loan: Loan; installments: LoanInstallment[] }> {
  const loan = await tx.loan.create({
    data: {
      organizationId: input.organizationId,
      lenderName: input.lenderName,
      principalAmount: input.principalAmount,
      currency: input.currency ?? "TRY",
      interestRate: input.interestRate ?? null,
      startDate: input.startDate,
      status: "ACTIVE",
      note: input.note ?? null,
      actorId: input.actorId,
    },
  });

  const installments: LoanInstallment[] = [];
  for (let index = 0; index < input.installments.length; index++) {
    const component = input.installments[index]!;
    const installment = await tx.loanInstallment.create({
      data: {
        organizationId: input.organizationId,
        loanId: loan.id,
        installmentIndex: index,
        dueDate: component.dueDate,
        principalAmount: component.principalAmount,
        interestAmount: component.interestAmount ?? 0,
        currency: loan.currency,
        actorId: input.actorId,
      },
    });
    installments.push(installment);
  }

  return { loan, installments };
}

export function findLoanById(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<Loan | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loan.findFirst({ where: { id, organizationId } });
}

export function listLoans(organizationId: string, status?: LoanStatus): Promise<Loan[]> {
  return prisma.loan.findMany({ where: { organizationId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" } });
}

export function findLoanInstallmentById(id: string, organizationId: string, tx?: PrismaTransactionClient): Promise<LoanInstallment | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loanInstallment.findFirst({ where: { id, organizationId } });
}

export function listLoanInstallments(organizationId: string, loanId: string): Promise<LoanInstallment[]> {
  return prisma.loanInstallment.findMany({ where: { organizationId, loanId }, orderBy: { installmentIndex: "asc" } });
}

export type CreateLoanDrawdownInput = {
  organizationId: string;
  loanId: string;
  kind: SettlementKind;
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

export function createLoanDrawdown(input: CreateLoanDrawdownInput, tx: PrismaTransactionClient): Promise<LoanDrawdown> {
  return tx.loanDrawdown.create({ data: input });
}

export function findLoanDrawdownByIdempotencyKey(organizationId: string, loanId: string, idempotencyKey: string, tx?: PrismaTransactionClient): Promise<LoanDrawdown | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loanDrawdown.findFirst({ where: { organizationId, loanId, idempotencyKey } });
}

export function findLoanDrawdownByReversalOfId(organizationId: string, reversalOfId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loanDrawdown.findFirst({ where: { organizationId, reversalOfId }, include: { movement: true } });
}

export function findLoanDrawdownForReversal(organizationId: string, id: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loanDrawdown.findFirst({ where: { id, organizationId }, include: { movement: true, reversal: true } });
}

export async function sumNetLoanDrawdowns(organizationId: string, loanId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.loanDrawdown.aggregate({ where: { organizationId, loanId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.loanDrawdown.aggregate({ where: { organizationId, loanId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}

export type CreateLoanFinancialMovementInput = {
  organizationId: string;
  financialAccountId: string;
  loanDrawdownId?: string;
  loanRepaymentId?: string;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  occurredAt: Date;
  direction: MoneyDirection;
  provenance: Prisma.InputJsonValue;
  reversalOfId?: string;
};

export function createLoanFinancialMovement(input: CreateLoanFinancialMovementInput, tx: PrismaTransactionClient): Promise<FinancialAccountMovement> {
  return tx.financialAccountMovement.create({ data: input });
}

export type CreateLoanRepaymentInput = {
  organizationId: string;
  loanInstallmentId: string;
  kind: SettlementKind;
  amount: number;
  principalPortion: number;
  interestPortion: number;
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

export function createLoanRepayment(input: CreateLoanRepaymentInput, tx: PrismaTransactionClient): Promise<LoanRepayment> {
  return tx.loanRepayment.create({ data: input });
}

export function findLoanRepaymentByIdempotencyKey(organizationId: string, loanInstallmentId: string, idempotencyKey: string, tx?: PrismaTransactionClient): Promise<LoanRepayment | null> {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loanRepayment.findFirst({ where: { organizationId, loanInstallmentId, idempotencyKey } });
}

export function findLoanRepaymentByReversalOfId(organizationId: string, reversalOfId: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loanRepayment.findFirst({ where: { organizationId, reversalOfId }, include: { movement: true } });
}

export function findLoanRepaymentForReversal(organizationId: string, id: string, tx?: PrismaTransactionClient) {
  const client: PrismaClientLike = tx ?? prisma;
  return client.loanRepayment.findFirst({ where: { id, organizationId }, include: { movement: true, reversal: true } });
}

/** principal+interest ayrımını KORUYARAK net toplam — reversal amount'u ORIGINAL'in principal/interest oranını miras alır (kendi satırında saklandığı için). */
export async function sumNetLoanRepayments(organizationId: string, loanInstallmentId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.loanRepayment.aggregate({ where: { organizationId, loanInstallmentId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.loanRepayment.aggregate({ where: { organizationId, loanInstallmentId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}
