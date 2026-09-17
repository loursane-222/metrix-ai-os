import type { DocumentModel } from "./document-model";
import { formatDocumentDate } from "./format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      default: return "&#39;";
    }
  });
}

function formatMoney(cents: string, currency: string): string {
  const amount = Number(cents) / 100;
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}`;
}

/**
 * Pure, deterministic renderer: the same DocumentModel always produces the
 * exact same HTML string. No I/O, no randomness, no current-time reads.
 * Produces a complete standalone HTML document (own <style>), meant to be
 * shown in an isolated preview surface (e.g. a sandboxed iframe), never
 * injected directly into the app's own DOM tree.
 */
export function renderDocumentHtml(model: DocumentModel): string {
  const rows = model.lines
    .map(line => `
      <tr>
        <td>${escapeHtml(line.name)}${line.unit ? ` <span class="unit">(${escapeHtml(line.unit)})</span>` : ""}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${formatMoney(line.unitPriceCents, model.currency)}</td>
        <td class="num">%${(line.vatRateBasisPoints / 100).toFixed(0)}</td>
        <td class="num">${formatMoney(line.lineTotalCents, model.currency)}</td>
      </tr>`)
    .join("");

  const metaRows = model.meta
    .map(field => `<div class="meta-row"><span class="meta-label">${escapeHtml(field.label)}</span><span class="meta-value">${escapeHtml(field.value)}</span></div>`)
    .join("");

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #fff; color: #14181f; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 14px; }
  .doc { max-width: 720px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14181f; padding-bottom: 16px; margin-bottom: 20px; }
  header h1 { margin: 0; font-size: 22px; letter-spacing: .02em; }
  header .number { margin-top: 4px; color: #667; font-size: 12px; }
  header .org { text-align: right; font-weight: 600; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
  .parties .block { flex: 1; }
  .parties .label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #889; margin-bottom: 4px; }
  .parties .value { font-size: 15px; font-weight: 600; }
  .meta { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-bottom: 20px; padding: 12px 0; border-top: 1px solid #e3e6ea; border-bottom: 1px solid #e3e6ea; }
  .meta-row { font-size: 12px; }
  .meta-label { color: #889; margin-right: 6px; }
  .meta-value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #889; padding: 6px 8px; border-bottom: 1px solid #14181f; }
  th.num, td.num { text-align: right; }
  td { padding: 8px; border-bottom: 1px solid #eef0f3; }
  .unit { color: #889; font-size: 12px; }
  .total { display: flex; justify-content: flex-end; gap: 12px; font-size: 16px; font-weight: 700; padding-top: 8px; }
  .notes { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e3e6ea; font-size: 12px; color: #556; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="doc">
    <header>
      <div>
        <h1>${escapeHtml(model.documentTitle)}</h1>
        <div class="number">${escapeHtml(model.documentNumber)} · ${formatDocumentDate(model.issuedAt)}</div>
      </div>
      <div class="org">${escapeHtml(model.organizationName)}</div>
    </header>
    <div class="parties">
      <div class="block">
        <div class="label">Müşteri</div>
        <div class="value">${escapeHtml(model.customerName)}</div>
      </div>
    </div>
    ${model.meta.length > 0 ? `<div class="meta">${metaRows}</div>` : ""}
    <table>
      <thead>
        <tr>
          <th>Kalem</th>
          <th class="num">Miktar</th>
          <th class="num">Birim Fiyat</th>
          <th class="num">KDV</th>
          <th class="num">Tutar</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">Genel Toplam ${formatMoney(model.totalCents, model.currency)}</div>
    ${model.notes ? `<div class="notes">${escapeHtml(model.notes)}</div>` : ""}
  </div>
</body>
</html>`;
}
