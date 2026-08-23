// Domain 25 — Yönetici İletişim Motoru. v1 scope: two canonical outbound
// communication types (payment reminder, supplier message), two audiences
// (customer, supplier), one channel (email), real tone escalation for
// payment reminders (FRIENDLY/FORMAL/DIRECT — see
// selectPaymentReminderTone). See executive-communication.service.ts for
// what's still deliberately deferred (multi-channel, scheduled/deferred
// send, team/board audiences).

export type ComposedCommunication = Readonly<{
  subject: string;
  html: string;
  text: string;
}>;

export type SendPaymentReminderOutcome =
  | Readonly<{ outcome: "SENT"; communicationId: string; recipientEmail: string; amountOwedText: string; currency: string }>
  | Readonly<{ outcome: "NO_OUTSTANDING_BALANCE" }>
  | Readonly<{ outcome: "CUSTOMER_NOT_FOUND" }>
  | Readonly<{ outcome: "MISSING_RECIPIENT_EMAIL" }>
  | Readonly<{ outcome: "PROVIDER_FAILED"; error: string }>;

export type SendSupplierMessageOutcome =
  | Readonly<{ outcome: "SENT"; communicationId: string; recipientEmail: string }>
  | Readonly<{ outcome: "SUPPLIER_NOT_FOUND" }>
  | Readonly<{ outcome: "MISSING_RECIPIENT_EMAIL" }>
  | Readonly<{ outcome: "PROVIDER_FAILED"; error: string }>;
