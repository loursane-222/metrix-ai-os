import { prisma } from "@/lib/core/shared/prisma";
import {
  createCollectionAction,
  findOpenActionByPaymentAndType,
} from "./collection-action.repository";
import { logActionCreated } from "./collection-action-event.service";
import type { CollectionActionType, SuggestedAction } from "./collection-action.types";
import type { PaymentStatus } from "@prisma/client";

const SYNC_STATUSES: PaymentStatus[] = ["OVERDUE", "PARTIAL"];
const LEGAL_THRESHOLD_DAYS = 60;
const URGENT_THRESHOLD_DAYS = 30;

type SyncResult = {
  created: number;
  skipped: number;
};

export async function syncAiCollectionActions(organizationId: string): Promise<SyncResult> {
  const now = new Date();
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      status: { in: SYNC_STATUSES },
    },
    select: {
      id: true,
      customerId: true,
      title: true,
      amount: true,
      paidAmount: true,
      status: true,
      dueDate: true,
      person: { select: { fullName: true } },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const payment of payments) {
    const customerName = payment.person?.fullName ?? payment.title;
    const amount = toSafeNumber(payment.amount);
    const paidAmount = toSafeNumber(payment.paidAmount);
    const remaining = amount - paidAmount;

    const daysPastDue =
      payment.status === "OVERDUE" && payment.dueDate
        ? Math.max(0, Math.floor((now.getTime() - payment.dueDate.getTime()) / 86400000))
        : 0;

    const suggestions = buildSuggestionsForPayment({
      paymentId: payment.id,
      paymentTitle: payment.title,
      customerName,
      remaining,
      daysPastDue,
      status: payment.status,
    });

    for (const suggestion of suggestions) {
      const existing = await findOpenActionByPaymentAndType(
        suggestion.paymentId,
        suggestion.actionType,
      );

      if (existing) {
        skipped++;
        continue;
      }

      const newAction = await createCollectionAction({
        organizationId,
        paymentId: suggestion.paymentId,
        customerId: payment.customerId,
        title: suggestion.title,
        actionType: suggestion.actionType,
        source: "AI_SUGGESTED",
        priority: suggestion.priority,
        aiReason: suggestion.aiReason,
      });
      await logActionCreated({
        organizationId,
        collectionActionId: newAction.id,
        aiReason: suggestion.aiReason ?? null,
      });
      created++;
    }
  }

  return { created, skipped };
}

function buildSuggestionsForPayment(input: {
  paymentId: string;
  paymentTitle: string;
  customerName: string;
  remaining: number;
  daysPastDue: number;
  status: PaymentStatus;
}): SuggestedAction[] {
  const { paymentId, paymentTitle, customerName, remaining, daysPastDue, status } = input;
  const suggestions: SuggestedAction[] = [];
  const formattedAmount = formatTRY(remaining);

  if (status === "OVERDUE") {
    if (daysPastDue >= LEGAL_THRESHOLD_DAYS) {
      suggestions.push({
        paymentId,
        actionType: "LEGAL_NOTICE" as CollectionActionType,
        title: `${customerName} — ${paymentTitle}: hukuki ihtar gönder`,
        aiReason: `${daysPastDue} gün gecikme, ${formattedAmount} risk altında.`,
        priority: computePriority(remaining, daysPastDue, "LEGAL_NOTICE"),
      });
    } else if (daysPastDue >= URGENT_THRESHOLD_DAYS) {
      suggestions.push({
        paymentId,
        actionType: "MEETING" as CollectionActionType,
        title: `${customerName} — ${paymentTitle}: birebir görüşme planla`,
        aiReason: `${daysPastDue} gün gecikme, ${formattedAmount} tahsilat bekliyor.`,
        priority: computePriority(remaining, daysPastDue, "MEETING"),
      });
    } else {
      suggestions.push({
        paymentId,
        actionType: "REMINDER" as CollectionActionType,
        title: `${customerName} — ${paymentTitle}: ödeme hatırlatması gönder`,
        aiReason: `${daysPastDue} gün gecikme, ${formattedAmount} bekliyor.`,
        priority: computePriority(remaining, daysPastDue, "REMINDER"),
      });
    }
  } else if (status === "PARTIAL") {
    suggestions.push({
      paymentId,
      actionType: "FOLLOW_UP" as CollectionActionType,
      title: `${customerName} — ${paymentTitle}: kalan ${formattedAmount} için net tarih al`,
      aiReason: `Kısmi ödeme yapıldı, kalan ${formattedAmount} tahsil edilmedi.`,
      priority: computePriority(remaining, 0, "FOLLOW_UP"),
    });
  }

  return suggestions;
}

function computePriority(
  remaining: number,
  daysPastDue: number,
  actionType: CollectionActionType,
): number {
  const typeBonus: Record<CollectionActionType, number> = {
    LEGAL_NOTICE: 40,
    MEETING: 30,
    CALL: 25,
    NEGOTIATION: 20,
    FOLLOW_UP: 15,
    REMINDER: 10,
  };
  const raw = remaining / 1000 + daysPastDue + typeBonus[actionType];
  return Math.min(100, Math.round(raw));
}

function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
