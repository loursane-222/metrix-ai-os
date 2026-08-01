// Offer dispatch email content — mirrors the OTP email template's visual
// contract (buildOtpEmailContent in email.service.ts): same brand shell,
// same dark/light-aware inline styles, no marketing headers. Content only;
// sending goes through the shared sendTransactionalEmail() provider.

import type { QuoteResult } from "./quote.types";

const SUPPORT_EMAIL = "support@metrixgm.com";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function formatAmount(quote: QuoteResult): string {
  if (quote.amount === null) return "-";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: quote.currency }).format(Number(quote.amount));
}

export type QuoteDispatchEmailContent = { subject: string; html: string; text: string };

export function buildQuoteDispatchEmailContent(quote: QuoteResult): QuoteDispatchEmailContent {
  const amount = formatAmount(quote);
  const subject = `${quote.title} — METRIX Teklifi`;

  const text = [
    "METRIX — AI Executive OS",
    "",
    `Sayın ${quote.customerName},`,
    "",
    `${quote.title} için hazırladığımız teklif ekte özetlenmiştir.`,
    `Toplam tutar: ${amount} ${quote.currency}`,
    ...(quote.validUntil ? [`Geçerlilik tarihi: ${new Date(quote.validUntil).toLocaleDateString("tr-TR")}`] : []),
    ...(quote.customerNote ? ["", quote.customerNote] : []),
    "",
    `Sorularınız için: ${SUPPORT_EMAIL}`,
    "",
    "© METRIX AI Executive OS",
  ].join("\n");

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>
  body{margin:0;background:#061018;color:#eaf2f4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif} .wrap{padding:32px 16px}.card{max-width:560px;margin:0 auto;background:#0b1821;border:1px solid #20333b;border-radius:24px;overflow:hidden}.head{padding:32px 32px 22px;text-align:center;background:radial-gradient(circle at 50% 0,rgba(52,230,207,.16),transparent 62%)}.brand{font-size:30px;font-weight:900;letter-spacing:.18em;color:#f4f7f8}.tag{margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.22em;color:#34e6cf}.body{padding:8px 32px 32px}.greeting{font-size:15px;color:#eaf2f4}.summary{margin:18px 0 22px;padding:20px;border:1px solid rgba(52,230,207,.28);border-radius:16px;background:#071417}.summary .title{font-size:16px;font-weight:700;color:#f4f7f8}.summary .amount{margin-top:8px;font:800 28px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#d9fff9}.copy{font-size:14px;line-height:1.65;color:#b8c3c9}.footer{padding:20px 32px;border-top:1px solid #20333b;text-align:center;font-size:12px;line-height:1.6;color:#6f7d87}.footer a{color:#34e6cf}@media(prefers-color-scheme:light){body{background:#eef4f3}.card{background:#fff;border-color:#d9e4e2}.brand{color:#071417}.body{color:#17262d}.summary{background:#f1faf8}.summary .title,.summary .amount{color:#092d29}.copy{color:#465960}.footer{border-color:#d9e4e2;color:#718087}}
</style></head><body><div class="wrap"><div class="card"><div class="head"><div class="brand">METRIX</div><div class="tag">AI EXECUTIVE OS</div></div><div class="body"><p class="greeting">Sayın ${escapeHtml(quote.customerName)},</p><p class="copy">${escapeHtml(quote.title)} için hazırladığımız teklif aşağıda özetlenmiştir.</p><div class="summary"><div class="title">${escapeHtml(quote.title)}</div><div class="amount">${escapeHtml(amount)}</div></div>${quote.customerNote ? `<p class="copy">${escapeHtml(quote.customerNote)}</p>` : ""}</div><div class="footer">Sorularınız için: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a><br>© METRIX AI Executive OS</div></div></div></body></html>`;

  return { subject, html, text };
}
