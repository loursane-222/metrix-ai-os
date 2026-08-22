import { prisma } from "@/lib/core/shared/prisma";
import { getCustomerStatement } from "@/lib/accounting/customer-statement.service";
import { sendTransactionalEmail } from "@/lib/core/email/resend-provider";
import { centsToAmount } from "@/lib/core/quotes/quote-totals";
import { buildPaymentReminderEmail } from "./payment-reminder-template";
import type { SendPaymentReminderOutcome } from "./executive-communication.types";

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
  const content = buildPaymentReminderEmail({ customerName: customer.displayName, amountText: amountOwedText, currency: owedBalance.currency });

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
      toneStrategy: "FRIENDLY",
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
