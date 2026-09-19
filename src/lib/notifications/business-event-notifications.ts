import { createHash } from "node:crypto";

import { executeNotificationCreate } from "../actions/notification-create";
import { db } from "../db";

/**
 * Notification categories. Notification.category is a free string in the
 * schema (there is no enum and no per-user preference model), so these
 * constants are the one place the canonical category names live.
 */
export const NOTIFICATION_CATEGORY = {
  TASKS: "TASKS",
  SALES: "SALES",
  FINANCE: "FINANCE",
  CRITICAL: "CRITICAL"
} as const;

type NotificationCategory =
  (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];

export type BusinessNotificationDraft = {
  category: NotificationCategory;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  title: string;
  body?: string;
  sourceType: string;
  sourceId: string;
  /** Identifies the business event, not the turn — the dedupe identity. */
  eventKey: string;
  /** Users besides the actor and the org's owners/admins who must know. */
  extraRecipientUserIds?: string[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatMoney(amount: unknown, currency: unknown): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;

  const code = text(currency);

  try {
    return code
      ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: code }).format(amount)
      : new Intl.NumberFormat("tr-TR").format(amount);
  } catch {
    return `${amount}${code ? ` ${code}` : ""}`;
  }
}

function formatInstant(iso: unknown, timezone: string): string | null {
  const value = text(iso);
  if (!value || Number.isNaN(Date.parse(value))) return null;

  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  };

  try {
    return new Intl.DateTimeFormat("tr-TR", { ...options, timeZone: timezone }).format(
      new Date(value)
    );
  } catch {
    return new Intl.DateTimeFormat("tr-TR", { ...options, timeZone: "UTC" }).format(
      new Date(value)
    );
  }
}

/**
 * The notification-worthy canonical business events, and only those. Each
 * is derived from an already VERIFIED tool result — never from model
 * text — and every other capability (reads, lookups, drafts of a change,
 * a user's own calendar entry) deliberately yields no notification, so the
 * system never becomes "every mutation is a notification".
 */
export function draftForVerifiedResult(
  name: string,
  result: unknown,
  timezone: string
): BusinessNotificationDraft | null {
  const data = asRecord(result);
  if (!data) return null;

  switch (name) {
    case "task_create": {
      const task = asRecord(data.task);
      const id = text(task?.id);
      const title = text(task?.title);
      if (!task || !id || !title) return null;

      const due = formatInstant(task.dueAt, timezone);
      const assignee = text(task.assignedToUserId);

      return {
        category: NOTIFICATION_CATEGORY.TASKS,
        priority: task.priority === "HIGH" ? "HIGH" : "NORMAL",
        title: `Görev oluşturuldu: ${title}`,
        body: due ? `Son tarih: ${due}` : undefined,
        sourceType: "Task",
        sourceId: id,
        eventKey: `task.created:${id}`,
        extraRecipientUserIds: assignee ? [assignee] : undefined
      };
    }

    case "task_update": {
      const task = asRecord(data.task);
      const id = text(task?.id);
      const title = text(task?.title);
      if (!task || !id || !title || task.status !== "DONE") return null;

      return {
        category: NOTIFICATION_CATEGORY.TASKS,
        priority: "NORMAL",
        title: `Görev tamamlandı: ${title}`,
        sourceType: "Task",
        sourceId: id,
        eventKey: `task.done:${id}`
      };
    }

    case "customer_create": {
      const customer = asRecord(data.customer);
      const id = text(customer?.id);
      const name = text(customer?.name);
      if (!id || !name) return null;

      return {
        category: NOTIFICATION_CATEGORY.SALES,
        priority: "NORMAL",
        title: `Yeni müşteri: ${name}`,
        sourceType: "Customer",
        sourceId: id,
        eventKey: `customer.created:${id}`
      };
    }

    case "quote_create":
    case "quote_mark_won": {
      const quote = asRecord(data.quote);
      const id = text(quote?.id);
      const label = [text(quote?.customerName), text(quote?.title)]
        .filter((part): part is string => part !== null)
        .join(" — ");
      if (!quote || !id) return null;

      const won = name === "quote_mark_won";
      const amount = formatMoney(quote.amount, quote.currency);

      return {
        category: NOTIFICATION_CATEGORY.SALES,
        priority: won ? "HIGH" : "NORMAL",
        title: `${won ? "Teklif kazanıldı" : "Teklif oluşturuldu"}${label ? `: ${label}` : ""}`,
        body: amount ? `Tutar: ${amount}` : undefined,
        sourceType: "Quote",
        sourceId: id,
        eventKey: `${won ? "quote.won" : "quote.created"}:${id}`
      };
    }

    case "order_create_from_quote": {
      const order = asRecord(data.order);
      const id = text(order?.id);
      const number = text(order?.orderNumber);
      if (!order || !id) return null;

      const amount = formatMoney(order.amount, order.currency);
      const customer = text(order.customerName);

      return {
        category: NOTIFICATION_CATEGORY.SALES,
        priority: "NORMAL",
        title: `Sipariş oluşturuldu${number ? `: ${number}` : ""}`,
        body: [customer, amount ? `Tutar: ${amount}` : null]
          .filter((part): part is string => part !== null)
          .join(" · ") || undefined,
        sourceType: "Order",
        sourceId: id,
        eventKey: `order.created:${id}`
      };
    }

    case "invoice_create_from_order": {
      const invoice = asRecord(data.invoice);
      const id = text(invoice?.id);
      const number = text(invoice?.invoiceNumber);
      if (!invoice || !id) return null;

      const total = formatMoney(invoice.totalAmount, invoice.currency);

      return {
        category: NOTIFICATION_CATEGORY.FINANCE,
        priority: "NORMAL",
        title: `Fatura oluşturuldu${number ? `: ${number}` : ""}`,
        body: total ? `Toplam: ${total}` : undefined,
        sourceType: "Invoice",
        sourceId: id,
        eventKey: `invoice.created:${id}`
      };
    }

    case "collection_record": {
      const collection = asRecord(data.collection);
      const id = text(collection?.settlementId);
      if (!collection || !id) return null;

      const amount = formatMoney(collection.amount, collection.currency);
      const outstanding = formatMoney(collection.outstanding, collection.currency);

      return {
        category: NOTIFICATION_CATEGORY.FINANCE,
        priority: "HIGH",
        title: `Tahsilat kaydedildi${amount ? `: ${amount}` : ""}`,
        body: outstanding ? `Kalan bakiye: ${outstanding}` : undefined,
        sourceType: "Settlement",
        sourceId: id,
        eventKey: `collection.recorded:${id}`
      };
    }

    default:
      return null;
  }
}

/** Only ever a member of the organization — never a user of another tenant. */
async function resolveRecipientUserIds(input: {
  organizationId: string;
  actorUserId: string;
  extraRecipientUserIds: string[];
}): Promise<string[]> {
  const members = await db.organizationMember.findMany({
    where: {
      organizationId: input.organizationId,
      OR: [
        { role: { in: ["OWNER", "ADMIN"] } },
        { userId: { in: [input.actorUserId, ...input.extraRecipientUserIds] } }
      ]
    },
    select: { userId: true }
  });

  return Array.from(new Set(members.map(member => member.userId)));
}

function notificationIdempotencyKey(eventKey: string, recipientUserId: string): string {
  return `bn:${createHash("sha256")
    .update(`${eventKey}:${recipientUserId}`)
    .digest("hex")
    .slice(0, 40)}`;
}

/**
 * Turns one VERIFIED canonical mutation result into its notification(s).
 *
 * - Only a result carrying verified:true produces anything: a mutation
 *   that failed threw before this point and never reaches it.
 * - The idempotency key derives from the business event (event + recipient),
 *   not the turn, so a replayed or retried mutation reuses the existing
 *   notification instead of stacking a second one.
 * - Delivery is best-effort: a notification problem must never turn a
 *   business mutation that already committed into a failure, so errors are
 *   contained here (a missing notification is not a false success).
 */
export async function emitBusinessEventNotifications(input: {
  name: string;
  result: unknown;
  context: { actorUserId: string; organizationId: string; timezone: string };
}): Promise<void> {
  try {
    await emitVerifiedEventNotifications(input);
  } catch {
    // Contained by design (see above).
  }
}

async function emitVerifiedEventNotifications(input: {
  name: string;
  result: unknown;
  context: { actorUserId: string; organizationId: string; timezone: string };
}): Promise<void> {
  const verified = asRecord(input.result);

  if (!verified || verified.verified !== true || verified.status !== "VERIFIED") {
    return;
  }

  const draft = draftForVerifiedResult(input.name, input.result, input.context.timezone);

  if (!draft) return;

  let recipients: string[];

  try {
    recipients = await resolveRecipientUserIds({
      organizationId: input.context.organizationId,
      actorUserId: input.context.actorUserId,
      extraRecipientUserIds: draft.extraRecipientUserIds ?? []
    });
  } catch {
    return;
  }

  for (const userId of recipients) {
    try {
      await executeNotificationCreate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey: notificationIdempotencyKey(draft.eventKey, userId),
        userId,
        category: draft.category,
        priority: draft.priority,
        title: draft.title,
        body: draft.body,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId
      });
    } catch {
      // Contained by design (see above).
    }
  }
}
