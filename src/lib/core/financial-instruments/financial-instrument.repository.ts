import { prisma } from "@/lib/core/shared/prisma";
import type { FinancialInstrument, InstrumentAllocation, InstrumentStatus, Prisma, SettlementKind } from "@prisma/client";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { RegisterInstrumentInput } from "./financial-instrument.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export function createFinancialInstrument(input: RegisterInstrumentInput, tx: PrismaTransactionClient = prisma): Promise<FinancialInstrument> {
  return tx.financialInstrument.create({
    data: {
      organizationId: input.organizationId,
      instrumentType: input.instrumentType,
      direction: input.direction,
      customerId: input.customerId,
      supplierId: input.supplierId,
      amount: input.amount,
      currency: input.currency ?? "TRY",
      issueDate: input.issueDate,
      maturityDate: input.maturityDate,
      instrumentNumber: input.instrumentNumber,
      bankName: input.bankName,
      branchName: input.branchName,
      drawerName: input.drawerName,
      notes: input.notes,
      actorId: input.actorId,
      status: "REGISTERED",
    },
  });
}

export function findFinancialInstrumentById(id: string, organizationId: string, tx: PrismaTransactionClient = prisma) {
  return tx.financialInstrument.findFirst({ where: { id, organizationId } });
}

export function listFinancialInstruments(input: { organizationId: string; direction?: "RECEIVED" | "ISSUED"; status?: InstrumentStatus; limit?: number }) {
  return prisma.financialInstrument.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.direction ? { direction: input.direction } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });
}

/**
 * order.repository.ts::updateOrderStatus ile aynı CAS deseni: where'e
 * fromStatus eklenir, iki eşzamanlı applyInstrumentToObligation/
 * clearInstrument/bounceInstrument/cancelInstrument çağrısından yalnız
 * biri bu instrument'ın durumunu değiştirebilir.
 */
export class InstrumentConcurrentlyModifiedError extends Error {
  constructor(instrumentId: string) {
    super(`FinancialInstrument ${instrumentId} was concurrently modified.`);
    this.name = "InstrumentConcurrentlyModifiedError";
  }
}

export async function updateInstrumentStatus(
  id: string,
  organizationId: string,
  fromStatus: InstrumentStatus,
  toStatus: InstrumentStatus,
  extra: { cancelReason?: string } = {},
  tx: PrismaTransactionClient = prisma,
) {
  const client: PrismaClientLike = tx;
  const result = await client.financialInstrument.updateMany({
    where: { id, organizationId, status: fromStatus },
    data: { status: toStatus, ...extra },
  });
  if (result.count === 0) {
    const stillExists = await client.financialInstrument.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (stillExists) throw new InstrumentConcurrentlyModifiedError(id);
  }
  return result;
}

export function recordInstrumentStatusHistory(
  input: { organizationId: string; instrumentId: string; fromStatus: InstrumentStatus | null; toStatus: InstrumentStatus; reason?: string; performedById?: string; evidence?: Record<string, unknown> },
  tx: PrismaTransactionClient = prisma,
) {
  return tx.instrumentStatusHistory.create({
    data: {
      organizationId: input.organizationId,
      instrumentId: input.instrumentId,
      fromStatus: input.fromStatus ?? undefined,
      toStatus: input.toStatus,
      reason: input.reason,
      performedById: input.performedById,
      evidence: input.evidence as Prisma.InputJsonValue | undefined,
    },
  });
}

export type CreateInstrumentAllocationInput = {
  organizationId: string;
  instrumentId: string;
  obligationScheduleLineId: string;
  kind: SettlementKind;
  amount: number;
  currency: string;
  appliedAt: Date;
  actorId: string;
  reversalOfId?: string;
  settledReferenceType?: string;
  settledReferenceId?: string;
};

export function createInstrumentAllocation(input: CreateInstrumentAllocationInput, tx: PrismaTransactionClient): Promise<InstrumentAllocation> {
  return tx.instrumentAllocation.create({ data: input });
}

export function markInstrumentAllocationSettled(
  id: string,
  organizationId: string,
  settledReferenceType: string,
  settledReferenceId: string,
  tx: PrismaTransactionClient,
) {
  return tx.instrumentAllocation.updateMany({ where: { id, organizationId }, data: { settledReferenceType, settledReferenceId } });
}

/** Reversal (kind=ORIGINAL) hariç bir instrument'ın hiç reversal'ı olmayan, aktif allocation'ları — clearInstrument'ın settle edeceği kümedir. */
export function findActiveAllocationsForInstrument(instrumentId: string, organizationId: string, tx: PrismaTransactionClient) {
  return tx.instrumentAllocation.findMany({
    where: { instrumentId, organizationId, kind: "ORIGINAL", reversal: null },
    include: { obligationScheduleLine: true },
  });
}

export function findInstrumentAllocationForReversal(id: string, organizationId: string, tx: PrismaTransactionClient) {
  return tx.instrumentAllocation.findFirst({ where: { id, organizationId }, include: { reversal: true } });
}

/** Bir instrument'ın YÜZÜNE karşı bugüne kadar (tüm obligation'lar toplamında) net allocate edilmiş tutar. */
export async function sumNetAllocationsForInstrument(instrumentId: string, organizationId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.instrumentAllocation.aggregate({ where: { instrumentId, organizationId, kind: "ORIGINAL" }, _sum: { amount: true } }),
    tx.instrumentAllocation.aggregate({ where: { instrumentId, organizationId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}

/**
 * Bir ObligationScheduleLine'a bugüne kadar STILL-UNSETTLED (henüz gerçek
 * paraya dönüşmemiş) instrument'lardan net allocate edilmiş tutar.
 *
 * KRİTİK: settledReferenceId dolu olan (clearInstrument tarafından gerçek
 * bir Settlement/SupplierPayment/ExpenseSettlement'a dönüştürülmüş)
 * ORIGINAL satırlar BİLEREK hariç tutulur. O tutar artık gerçek
 * Payment/Expense/PurchaseInvoice.paidAmount'ın içinde yaşıyor —
 * applyInstrumentToObligation'ın ceiling'i
 * (totalAmount - paidAmount - sumNetAllocationsForObligation(...)) bu
 * fonksiyonu paidAmount'un YANINDA kullanıyor; cleared bir allocation'ı
 * burada da saymak aynı gerçek parayı iki kez düşmek (double-count) demek
 * olurdu — obligation coverage'ı 100 yerine 200 gösterirdi. Bu fonksiyon
 * sadece "henüz nakde dönüşmemiş, hâlâ enstrümanla kaplı" kısmı temsil
 * eder; sumNetAllocationsForInstrument (enstrümanın KENDİ yüzü ne kadar
 * harcandı sorusu) kasıtlı olarak farklıdır ve cleared satırları saymaya
 * devam eder — o tutar kalıcı olarak harcanmıştır, tekrar allocate
 * edilemez.
 */
export async function sumNetAllocationsForObligation(obligationScheduleLineId: string, organizationId: string, tx: PrismaTransactionClient): Promise<number> {
  const [original, reversal] = await Promise.all([
    tx.instrumentAllocation.aggregate({ where: { obligationScheduleLineId, organizationId, kind: "ORIGINAL", settledReferenceId: null }, _sum: { amount: true } }),
    tx.instrumentAllocation.aggregate({ where: { obligationScheduleLineId, organizationId, kind: "REVERSAL" }, _sum: { amount: true } }),
  ]);
  return Number(original._sum.amount ?? 0) - Number(reversal._sum.amount ?? 0);
}
