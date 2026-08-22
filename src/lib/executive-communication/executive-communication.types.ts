// Domain 25 — Yönetici İletişim Motoru. v1 scope: one canonical outbound
// communication type (payment reminder), one audience (customer), one
// channel (email), one tone preset (FRIENDLY — matches Leadership DNA's
// "babacan/anaç" register). See executive-communication.service.ts for
// what's deliberately deferred (multi-channel, negotiation-tone
// intelligence, scheduled/deferred send, supplier/team audiences).

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
