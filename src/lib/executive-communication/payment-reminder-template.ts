import type { ComposedCommunication } from "./executive-communication.types";

export type PaymentReminderTone = "FRIENDLY" | "FORMAL" | "DIRECT";

// Real tone escalation, not a stylistic default: FRIENDLY when nothing is
// actually overdue yet (a proactive, soft ask), FORMAL once one payment has
// genuinely gone overdue, DIRECT once more than one has — see
// selectPaymentReminderTone (executive-communication.service.ts) for how
// this is computed from the customer's real statement.movements, never
// guessed.
export function buildPaymentReminderEmail(input: {
  customerName: string;
  amountText: string;
  currency: string;
  tone: PaymentReminderTone;
}): ComposedCommunication {
  const body = TONE_BODY[input.tone](input);
  const subject = TONE_SUBJECT[input.tone](input.customerName);
  const text = body.join("\n");
  const html = body.map((line) => (line === "" ? "" : `<p>${line}</p>`)).join("");
  return { subject, html, text };
}

const TONE_SUBJECT: Record<PaymentReminderTone, (customerName: string) => string> = {
  FRIENDLY: (customerName) => `${customerName} - Ödeme Hatırlatması`,
  FORMAL: (customerName) => `${customerName} - Vadesi Geçmiş Bakiye Bildirimi`,
  DIRECT: (customerName) => `${customerName} - Acil: Vadesi Geçmiş Ödeme`,
};

const TONE_BODY: Record<PaymentReminderTone, (input: { customerName: string; amountText: string; currency: string }) => string[]> = {
  FRIENDLY: ({ customerName, amountText, currency }) => [
    `Merhaba ${escapeHtml(customerName)},`,
    "",
    `Hesabınızda ${escapeHtml(amountText)} ${escapeHtml(currency)} tutarında açık bir bakiye bulunuyor.`,
    "Uygun olduğunuzda bu tutarı kapatmanızı rica ederiz.",
    "",
    "Herhangi bir sorunuz olursa bize ulaşabilirsiniz.",
    "",
    "Saygılarımızla",
  ],
  FORMAL: ({ customerName, amountText, currency }) => [
    `Sayın ${escapeHtml(customerName)},`,
    "",
    `Hesabınızda ${escapeHtml(amountText)} ${escapeHtml(currency)} tutarında vadesi geçmiş bir bakiye bulunmaktadır.`,
    "Bu tutarın en kısa sürede kapatılmasını rica ederiz.",
    "",
    "Ödemenizi zaten gerçekleştirdiyseniz bu bildirimi dikkate almayınız; aksi halde tarafımızla iletişime geçmenizi rica ederiz.",
    "",
    "Saygılarımızla",
  ],
  DIRECT: ({ customerName, amountText, currency }) => [
    `Sayın ${escapeHtml(customerName)},`,
    "",
    `Hesabınızda ${escapeHtml(amountText)} ${escapeHtml(currency)} tutarında, birden fazla kalemi kapsayan vadesi geçmiş bir bakiye bulunmaktadır.`,
    "Bu tutarın gecikmeden kapatılmasını önemle rica ederiz.",
    "",
    "Ödeme planı konusunda bir zorluk yaşıyorsanız lütfen en kısa sürede bizimle iletişime geçin.",
    "",
    "Saygılarımızla",
  ],
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
