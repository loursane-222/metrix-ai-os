import { prisma } from "@/lib/core/shared/prisma";
import type { PaymentStatus } from "@prisma/client";
import { classifyFinancialDueStatus, DEFAULT_TIME_ZONE } from "@/lib/core/calendar/calendar-timezone";

const RECEIVABLE_STATUSES: PaymentStatus[] = ["PENDING", "PARTIAL", "OVERDUE"];
const MAX_OVERDUE_ITEMS = 10;
const MAX_PARTIAL_ITEMS = 10;
const MAX_RECENT_PAYMENTS = 10;
const RECENT_PAYMENT_DAYS = 30;

export type PaymentContextOverdueItem = {
  title: string;
  customerName: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  daysPastDue: number;
};

export type PaymentContextPartialItem = {
  title: string;
  customerName: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
};

export type PaymentContextRecentPayment = {
  title: string;
  customerName: string;
  amount: number;
  paidAt: string;
};

export type PaymentContext = {
  totalReceivable: number;
  totalOverdue: number;
  overdueCount: number;
  pendingCount: number;
  partialCount: number;
  overdueItems: PaymentContextOverdueItem[];
  partialItems: PaymentContextPartialItem[];
  recentPayments: PaymentContextRecentPayment[];
};

/**
 * Phase 13: overdue/partial/pending classification no longer trusts the
 * stored `Payment.status` field for the OVERDUE transition (that field only
 * updates via `reconcileOverdueStatuses`, a lazy job triggered by
 * `listPayments()` — a payment can sit visibly overdue-by-date for a while
 * with `status` still PENDING if nothing has listed it recently). Instead,
 * "overdue" here is computed live from `dueDate` via Phase 12's canonical,
 * timezone-correct `classifyFinancialDueStatus` on every call — always
 * fresh, never dependent on a background job having run first.
 * `totalReceivable` itself (amount − paidAmount) was already numerically
 * accurate (Phase 3 keeps `Payment.paidAmount` in sync via CAS on every
 * settlement/reversal) and is unchanged.
 */
export async function buildPaymentContextForOrganization(
  organizationId: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<PaymentContext> {
  const recentCutoff = new Date(Date.now() - RECENT_PAYMENT_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [receivablePayments, recentPaidPayments] = await Promise.all([
    prisma.payment.findMany({
      where: { organizationId, status: { in: RECEIVABLE_STATUSES } },
      select: {
        title: true,
        amount: true,
        paidAmount: true,
        status: true,
        dueDate: true,
        person: { select: { fullName: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.payment.findMany({
      where: {
        organizationId,
        status: "PAID",
        paidAt: { gte: recentCutoff },
      },
      select: {
        title: true,
        amount: true,
        paidAt: true,
        person: { select: { fullName: true } },
      },
      orderBy: { paidAt: "desc" },
      take: MAX_RECENT_PAYMENTS,
    }),
  ]);

  let totalReceivable = 0;
  let totalOverdue = 0;
  let overdueCount = 0;
  let pendingCount = 0;
  let partialCount = 0;
  const overdueItems: PaymentContextOverdueItem[] = [];
  const partialItems: PaymentContextPartialItem[] = [];

  for (const payment of receivablePayments) {
    const amount = toSafeNumber(payment.amount);
    const paidAmount = toSafeNumber(payment.paidAmount);
    const remaining = amount - paidAmount;
    totalReceivable += remaining;

    const isOverdue = payment.dueDate !== null && classifyFinancialDueStatus(payment.dueDate, now, timeZone) === "OVERDUE";

    if (isOverdue) {
      totalOverdue += remaining;
      overdueCount++;

      if (overdueItems.length < MAX_OVERDUE_ITEMS) {
        const dueDate = payment.dueDate ?? new Date(0);
        overdueItems.push({
          title: payment.title,
          customerName: payment.person?.fullName ?? payment.title,
          amount,
          paidAmount,
          dueDate: dueDate.toISOString().slice(0, 10),
          daysPastDue: Math.max(
            0,
            Math.floor((now.getTime() - dueDate.getTime()) / 86400000),
          ),
        });
      }
    } else if (payment.status === "PARTIAL") {
      partialCount++;

      if (partialItems.length < MAX_PARTIAL_ITEMS) {
        partialItems.push({
          title: payment.title,
          customerName: payment.person?.fullName ?? payment.title,
          amount,
          paidAmount,
          dueDate: payment.dueDate ? payment.dueDate.toISOString().slice(0, 10) : null,
        });
      }
    } else {
      pendingCount++;
    }
  }

  const recentPayments: PaymentContextRecentPayment[] = recentPaidPayments.map(
    (payment) => ({
      title: payment.title,
      customerName: payment.person?.fullName ?? payment.title,
      amount: toSafeNumber(payment.amount),
      paidAt: (payment.paidAt ?? now).toISOString().slice(0, 10),
    }),
  );

  return {
    totalReceivable,
    totalOverdue,
    overdueCount,
    pendingCount,
    partialCount,
    overdueItems,
    partialItems,
    recentPayments,
  };
}

function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
