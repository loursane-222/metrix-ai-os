import type { ComposedCommunication } from "./executive-communication.types";

export function buildPaymentReminderEmail(input: {
  customerName: string;
  amountText: string;
  currency: string;
}): ComposedCommunication {
  const subject = `${input.customerName} - Ödeme Hatırlatması`;
  const text = [
    `Merhaba ${input.customerName},`,
    "",
    `Hesabınızda ${input.amountText} ${input.currency} tutarında açık bir bakiye bulunuyor.`,
    "Uygun olduğunuzda bu tutarı kapatmanızı rica ederiz.",
    "",
    "Herhangi bir sorunuz olursa bize ulaşabilirsiniz.",
    "",
    "Saygılarımızla",
  ].join("\n");
  const html = [
    `<p>Merhaba ${escapeHtml(input.customerName)},</p>`,
    `<p>Hesabınızda <strong>${escapeHtml(input.amountText)} ${escapeHtml(input.currency)}</strong> tutarında açık bir bakiye bulunuyor.</p>`,
    "<p>Uygun olduğunuzda bu tutarı kapatmanızı rica ederiz.</p>",
    "<p>Herhangi bir sorunuz olursa bize ulaşabilirsiniz.</p>",
    "<p>Saygılarımızla</p>",
  ].join("");
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
