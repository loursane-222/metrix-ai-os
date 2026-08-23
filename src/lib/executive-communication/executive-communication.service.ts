import { prisma } from "@/lib/core/shared/prisma";
import { getCustomerStatement, type CustomerStatementMovement } from "@/lib/accounting/customer-statement.service";
import { sendTransactionalEmail } from "@/lib/core/email/resend-provider";
import { centsToAmount } from "@/lib/core/quotes/quote-totals";
import { buildPaymentReminderEmail, type PaymentReminderTone } from "./payment-reminder-template";
import { buildSupplierMessageEmail } from "./supplier-message-template";
import type { SendPaymentReminderOutcome, SendSupplierMessageOutcome } from "./executive-communication.types";

// Escalates with real overdue severity — never a stylistic default. FRIENDLY
// when nothing is actually overdue yet (a proactive, soft ask); FORMAL once
// exactly one payment has genuinely gone overdue; DIRECT once more than one
// has. Computed from the customer's real statement.movements (never guessed
// or left at a fixed preset), matching Domain 25's Evidence Policy.
export function selectPaymentReminderTone(movements: readonly CustomerStatementMovement[]): PaymentReminderTone {
  const overdueCount = movements.filter((movement) => movement.sourceType === "PAYMENT" && movement.status === "OVERDUE").length;
  if (overdueCount === 0) return "FRIENDLY";
  if (overdueCount === 1) return "FORMAL";
  return "DIRECT";
}

// Domain 25's Evidence Policy (§11 of the constitution): no message may
// contain unverified information. The owed amount is never taken from the
// caller — it is read from getCustomerStatement(), the same canonical
// balance computation the Muhasebe/Accounting domain already owns, so the
// number in this email is always the real, current ledger-derived balance.
export async function sendPaymentReminder(input: {
  organizationId: string;
  customerId: string;
  actorUserId: string;
}): Promise<SendPaymentReminderOutcome> {
  const statement = await getCustomerStatement(input.organizationId, input.customerId);
  if (!statement) return { outcome: "CUSTOMER_NOT_FOUND" };

  const owedBalance = statement.balances.find((balance) => BigInt(balance.balanceCents) > BigInt(0));
  if (!owedBalance) return { outcome: "NO_OUTSTANDING_BALANCE" };

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organizationId: input.organizationId },
    select: { displayName: true, email: true },
  });
  const recipientEmail = customer?.email?.trim();
  if (!customer || !recipientEmail) return { outcome: "MISSING_RECIPIENT_EMAIL" };

  const amountOwedText = centsToAmount(BigInt(owedBalance.balanceCents)).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tone = selectPaymentReminderTone(statement.movements);
  const content = buildPaymentReminderEmail({ customerName: customer.displayName, amountText: amountOwedText, currency: owedBalance.currency, tone });

  let status: "SENT" | "FAILED" = "SENT";
  let providerMessageId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const result = await sendTransactionalEmail({ to: recipientEmail, subject: content.subject, html: content.html, text: content.text });
    providerMessageId = result.providerMessageId;
  } catch (error) {
    status = "FAILED";
    errorMessage = error instanceof Error ? error.message : "Unknown provider failure.";
  }

  const record = await prisma.executiveCommunication.create({
    data: {
      organizationId: input.organizationId,
      communicationType: "PAYMENT_REMINDER",
      audienceType: "CUSTOMER",
      customerId: input.customerId,
      channel: "EMAIL",
      toneStrategy: tone,
      objective: "Açık bakiye tahsilat hatırlatması",
      subject: content.subject,
      body: content.text,
      recipientEmail,
      status,
      providerMessageId,
      errorMessage,
      evidenceRefs: { balanceCents: owedBalance.balanceCents, currency: owedBalance.currency, evidenceSource: "customer-statement" },
      triggerUserId: input.actorUserId,
      sentAt: status === "SENT" ? new Date() : null,
    },
  });

  if (status === "FAILED") return { outcome: "PROVIDER_FAILED", error: errorMessage ?? "Unknown error." };

  return { outcome: "SENT", communicationId: record.id, recipientEmail, amountOwedText, currency: owedBalance.currency };
}

// messageBody is the user's own dictated content, passed straight through
// from supplier-message-conversation-extension.ts — this function's job is
// only resolving the real supplier record and recipient email, then
// delivering exactly what was asked, never composing or embellishing
// content itself (see supplier-message-template.ts).
export async function sendSupplierMessage(input: {
  organizationId: string;
  supplierId: string;
  messageBody: string;
  actorUserId: string;
}): Promise<SendSupplierMessageOutcome> {
  const [supplier, organization] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.supplierId, organizationId: input.organizationId }, select: { displayName: true, email: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId }, select: { name: true } }),
  ]);
  if (!supplier) return { outcome: "SUPPLIER_NOT_FOUND" };
  const recipientEmail = supplier.email?.trim();
  if (!recipientEmail) return { outcome: "MISSING_RECIPIENT_EMAIL" };

  const content = buildSupplierMessageEmail({ supplierName: supplier.displayName, organizationName: organization.name, messageBody: input.messageBody });

  let status: "SENT" | "FAILED" = "SENT";
  let providerMessageId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const result = await sendTransactionalEmail({ to: recipientEmail, subject: content.subject, html: content.html, text: content.text });
    providerMessageId = result.providerMessageId;
  } catch (error) {
    status = "FAILED";
    errorMessage = error instanceof Error ? error.message : "Unknown provider failure.";
  }

  const record = await prisma.executiveCommunication.create({
    data: {
      organizationId: input.organizationId,
      communicationType: "SUPPLIER_MESSAGE",
      audienceType: "SUPPLIER",
      supplierId: input.supplierId,
      channel: "EMAIL",
      toneStrategy: "FORMAL",
      objective: "Kullanıcı tarafından dikte edilen tedarikçi mesajı",
      subject: content.subject,
      body: content.text,
      recipientEmail,
      status,
      providerMessageId,
      errorMessage,
      evidenceRefs: { evidenceSource: "user-dictated" },
      triggerUserId: input.actorUserId,
      sentAt: status === "SENT" ? new Date() : null,
    },
  });

  if (status === "FAILED") return { outcome: "PROVIDER_FAILED", error: errorMessage ?? "Unknown error." };

  return { outcome: "SENT", communicationId: record.id, recipientEmail };
}
