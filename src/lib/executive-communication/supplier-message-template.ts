import type { ComposedCommunication } from "./executive-communication.types";

// Unlike payment-reminder-template.ts, this never composes claims about the
// supplier — messageBody is the user's own dictated words, passed through
// verbatim (only wrapped in a greeting/signature). There is nothing here
// for Domain 25's Evidence Policy to ground, because nothing is being
// asserted about the supplier's account or history.
export function buildSupplierMessageEmail(input: {
  supplierName: string;
  organizationName: string;
  messageBody: string;
}): ComposedCommunication {
  const subject = `${input.organizationName} tarafından bir mesajınız var`;
  const text = [
    `Merhaba ${input.supplierName},`,
    "",
    input.messageBody,
    "",
    "Saygılarımızla,",
    input.organizationName,
  ].join("\n");
  const html = [
    `<p>Merhaba ${escapeHtml(input.supplierName)},</p>`,
    `<p>${escapeHtml(input.messageBody).replace(/\n/g, "<br/>")}</p>`,
    `<p>Saygılarımızla,<br/>${escapeHtml(input.organizationName)}</p>`,
  ].join("");
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
