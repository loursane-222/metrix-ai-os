import type { CompanyQueryResult } from "./company-query-authority.service";

const numberFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const money = (amount: number, currency: string) => `${numberFormatter.format(amount)} ${currency}`;
const dateLabel = (iso: string) => new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));

function centsToMoney(cents: string | null, currency: string): string {
  if (cents === null) return `tutarı belirtilmemiş (${currency})`;
  return money(Number(BigInt(cents)) / 100, currency);
}

/**
 * Turns a CompanyQueryResult into deterministic Turkish text — every number
 * here is copied straight from an already-computed canonical dataset, never
 * recomputed or interpreted. This is the "facts" half of the fact/judgment
 * separation; company-query-judgment.service.ts appends the clearly-labeled
 * opinion half only when the plan asked for one.
 */
export function buildCompanyQueryResponse(result: CompanyQueryResult): string {
  if (result.scope === "customer_not_found") {
    return `"${result.reference}" adıyla eşleşen bir müşteri bulamadım.`;
  }
  if (result.scope === "customer_ambiguous") {
    const options = result.candidates.map((c) => c.displayName).join(", ");
    return `"${result.reference}" birden fazla müşteriyle eşleşiyor: ${options}. Hangisini kastettiğini söyler misin?`;
  }

  if (result.scope === "customer_set") {
    if (result.matches.length === 0) {
      return `Bu kritere (${result.setPipelineDescription.join(" → ")}${result.dateRangeLabel ? `, dönem: ${result.dateRangeLabel}` : ""}) uyan müşteri bulamadım.`;
    }
    const lines = result.matches.map((match) => {
      const receivable = match.receivableOutstanding?.length
        ? ` — güncel açık alacak: ${match.receivableOutstanding.map((r) => money(r.amount, r.currency)).join(", ")}`
        : "";
      return `- ${match.customerName}${receivable}`;
    });
    return [
      `${result.matches.length} müşteri bu kritere uyuyor (${result.setPipelineDescription.join(" → ")}${result.dateRangeLabel ? `, dönem: ${result.dateRangeLabel}` : ""}):`,
      ...lines,
    ].join("\n");
  }

  // single_customer
  const sections: string[] = [`${result.customer.displayName} — ticari ilişki özeti:`];

  if (result.quoteHistory) {
    if (result.quoteHistory.length === 0) {
      sections.push(`- Teklif geçmişi: ${result.dateRangeLabel ?? "kayıtlı dönemde"} gönderilmiş teklif bulunamadı.`);
    } else {
      const sent = result.quoteHistory.filter((q) => q.sentAt).length;
      const won = result.quoteHistory.filter((q) => q.status === "WON").length;
      const lost = result.quoteHistory.filter((q) => q.status === "LOST").length;
      const open = result.quoteHistory.filter((q) => ["SENT", "VIEWED", "NEGOTIATION"].includes(q.status)).length;
      sections.push(`- Teklif geçmişi${result.dateRangeLabel ? ` (${result.dateRangeLabel})` : ""}: ${result.quoteHistory.length} teklif, ${sent} gönderilmiş, ${won} kazanılmış, ${lost} kaybedilmiş, ${open} açık/devam eden.`);
    }
  }

  if (result.orderHistory) {
    if (result.orderHistory.length === 0) {
      sections.push(`- Sipariş geçmişi: ${result.dateRangeLabel ?? "kayıtlı dönemde"} onaylanmış sipariş bulunamadı.`);
    } else {
      const byCurrency = new Map<string, bigint>();
      for (const order of result.orderHistory) {
        if (order.confirmedValueCents === null) continue;
        byCurrency.set(order.currency, (byCurrency.get(order.currency) ?? BigInt(0)) + BigInt(order.confirmedValueCents));
      }
      const totals = [...byCurrency.entries()].map(([currency, cents]) => centsToMoney(cents.toString(), currency)).join(", ") || "tutar bilgisi mevcut değil";
      sections.push(`- Sipariş geçmişi${result.dateRangeLabel ? ` (${result.dateRangeLabel})` : ""}: ${result.orderHistory.length} onaylı sipariş, onay anı toplam değeri: ${totals}.`);
    }
  }

  if (result.receivable) {
    sections.push(
      result.receivable.length === 0
        ? "- Güncel alacak pozisyonu: açık bakiye bulunmuyor."
        : `- Güncel alacak pozisyonu: ${result.receivable.map((r) => `${money(r.totalOutstanding, r.currency)} (gecikmiş: ${money(r.overdueOutstanding, r.currency)})`).join(", ")}.`,
    );
  }

  if (result.commercialTerms !== undefined) {
    sections.push(
      result.commercialTerms === null
        ? "- Ticari koşullar: bu müşteri için kayıtlı özel bir ticari koşul bulunmuyor."
        : `- Ticari koşullar: vade ${result.commercialTerms.paymentTermDays ?? "belirtilmemiş"} gün, kredi limiti ${result.commercialTerms.creditLimitCents ? centsToMoney(result.commercialTerms.creditLimitCents, result.commercialTerms.defaultCurrency ?? "TRY") : "belirtilmemiş"}, teslim şartı ${result.commercialTerms.deliveryTerm ?? "belirtilmemiş"}.`,
    );
  }

  if (result.conversationHistory) {
    if (result.conversationHistory.length === 0) {
      sections.push("- Geçmiş konuşmalar: bu konuda daha önceki bir konuşma bulamadım.");
    } else {
      sections.push("- Geçmiş konuşmalar:");
      for (const hit of result.conversationHistory) {
        sections.push(`  - ${dateLabel(hit.createdAt)}${hit.conversationTitle ? ` (${hit.conversationTitle})` : ""}: "${hit.snippet}"`);
      }
    }
  }

  return sections.join("\n");
}
