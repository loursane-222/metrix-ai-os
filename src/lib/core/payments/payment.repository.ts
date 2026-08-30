import type { PaymentStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type { CreatePaymentRepositoryInput, PaymentResult } from "./payment.types";

type PrismaClientLike = typeof prisma | PrismaTransactionClient;

export async function createPayment(
  input: CreatePaymentRepositoryInput,
  tx?: PrismaTransactionClient,
): Promise<PaymentResult> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.payment.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      personId: input.personId,
      quoteId: input.quoteId,
      invoiceId: input.invoiceId,
      title: input.title,
      amount: input.amount,
      currency: input.currency ?? "TRY",
      dueDate: input.dueDate ?? null,
      maturityScheduleComponent: input.maturityScheduleComponent as Prisma.InputJsonValue | undefined,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash: input.requestHash ?? null,
    },
  });
}

export async function listPaymentsForOrganization(organizationId: string): Promise<PaymentResult[]> {
  return prisma.payment.findMany({
    where: { organizationId },
    include: { invoice: { select: { invoiceNumber: true, title: true, totalAmount: true, currency: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
}

// listPaymentsForOrganization caps at 100 rows — the real total, unbounded
// by that cap, for callers that need to display "how many total" rather
// than "how many loaded".
export async function countPaymentsForOrganization(organizationId: string): Promise<number> {
  return prisma.payment.count({ where: { organizationId } });
}

export async function findPaymentByIdForOrganization(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<PaymentResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.payment.findFirst({
    where: { id, organizationId },
  });
}

/**
 * Bir Payment satırının, bu fonksiyonun kendi okuduğu andan bu yana başka
 * bir eşzamanlı transaction tarafından değiştirildiğini işaretler —
 * "bulunamadı" değil, "bulundu ama artık beklenen halinde değil" demektir.
 * applySettlement bunu yakalayıp tüm denemeyi taze bir okuma ile tekrar
 * eder; over-application ceiling'in check-then-create race'e açık kalmasını
 * engelleyen mekanizmanın parçasıdır.
 */
export class PaymentConcurrentlyModifiedError extends Error {
  constructor(paymentId: string) {
    super(`Payment ${paymentId} was concurrently modified.`);
    this.name = "PaymentConcurrentlyModifiedError";
  }
}

/**
 * Tenant-safe koşullu güncelleme: updateMany + organizationId where'i,
 * başka bir organizasyona ait bir id ile eşleşmeyi imkansız kılar. count
 * 0 ise (organizasyonda) kayıt bulunamadı demektir — çağıran null görür.
 *
 * expectedPriorPaidAmount opsiyoneldir ve verildiğinde where'e eklenir —
 * bu, çağıranın bu fonksiyonu çağırmadan hemen önce okuduğu paidAmount
 * değeridir. Postgres bu satırı UPDATE için kilitlediğinden (aynı satıra
 * yazmaya çalışan başka bir transaction commit/rollback edene kadar bekler),
 * bu tek satırlık koşullu güncelleme atomik bir compare-and-swap'tır: iki
 * eşzamanlı yazıcıdan yalnız biri, tam olarak beklediği eski değeri
 * bulduğunda başarılı olabilir. Diğeri count=0 görür; satır hâlâ varsa
 * (sadece paidAmount değiştiği için eşleşmediyse) bu "bulunamadı" değil bir
 * eşzamanlılık çakışmasıdır — PaymentConcurrentlyModifiedError fırlatılır.
 * expectedPriorPaidAmount verilmezse davranış tamamen değişmeden kalır
 * (mevcut çağıranlar, örn. reverseSettlement, etkilenmez).
 */
export async function applyPaymentAmount(
  input: { id: string; organizationId: string; paidAmount: number; status: PaymentStatus; paidAt: Date | null; expectedPriorPaidAmount?: number },
  tx?: PrismaTransactionClient,
): Promise<PaymentResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  const result = await client.payment.updateMany({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      ...(input.expectedPriorPaidAmount !== undefined ? { paidAmount: input.expectedPriorPaidAmount } : {}),
    },
    data: { paidAmount: input.paidAmount, status: input.status, paidAt: input.paidAt },
  });

  if (result.count === 0) {
    if (input.expectedPriorPaidAmount !== undefined) {
      const stillExists = await client.payment.findFirst({ where: { id: input.id, organizationId: input.organizationId }, select: { id: true } });
      if (stillExists) throw new PaymentConcurrentlyModifiedError(input.id);
    }
    return null;
  }

  return client.payment.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
}

// Only a PENDING payment (nothing applied against it yet) can be voided —
// a PARTIAL/PAID payment represents a real, already-recorded collection
// fact, not something an orchestration failure should silently unwind.
export async function markPaymentVoided(
  id: string,
  organizationId: string,
  tx?: PrismaTransactionClient,
): Promise<PaymentResult | null> {
  const client: PrismaClientLike = tx ?? prisma;
  const updated = await client.payment.updateMany({
    where: { id, organizationId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (updated.count !== 1) return null;
  return client.payment.findFirst({ where: { id, organizationId } });
}

/**
 * Tahsilatlar Anayasası §4 "Otomatik Alanlar: Durum" — vadesi geçmiş, henüz
 * tam tahsil edilmemiş kayıtları OVERDUE'ya çevirir. PAID/CANCELLED/
 * WRITTEN_OFF'a dokunmaz. Tenant-safe (organizationId where'i).
 */
export async function reconcileOverdueStatuses(organizationId: string, now: Date = new Date()): Promise<number> {
  const result = await prisma.payment.updateMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "PARTIAL"] },
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });
  return result.count;
}

export async function findByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
  tx?: PrismaTransactionClient,
): Promise<PaymentResult | null> {
  const client: PrismaClientLike = tx ?? prisma;

  return client.payment.findFirst({
    where: { organizationId, idempotencyKey },
  });
}
