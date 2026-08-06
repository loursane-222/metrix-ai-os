import type { AccountingMetric, AccountingSummary } from "@/lib/accounting/accounting-summary";

const METRICS: ReadonlyArray<readonly [keyof AccountingSummary["metrics"], string]> = [
  ["cashPosition", "Tahsilat − Ödenen Gider"],
  ["totalReceivable", "Toplam Alacak"],
  ["totalPayable", "Toplam Borç"],
  ["monthlyRevenue", "Bu Ay Gelir"],
  ["monthlyExpense", "Bu Ay Gider"],
  ["monthlyTaxLiability", "Vergi Yükü"],
];

export function AccountingSummarySurface({ summary }: { summary: AccountingSummary }) {
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {METRICS.map(([key, title]) => <MetricCard key={key} metric={summary.metrics[key]} title={title}/>) }
    </div>
    <div className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4 text-xs leading-5 text-[#788691]">
      Kaynak kayıtlar: {summary.sourceCounts.invoices} fatura, {summary.sourceCounts.payments} tahsilat, {summary.sourceCounts.expenses} gider. Para birimleri birbirine çevrilmeden ayrı gösterilir.
    </div>
  </div>;
}

function MetricCard({ metric, title }: { metric: AccountingMetric; title: string }) {
  return <div className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl">
    <p className="text-[10px] uppercase tracking-wider text-[#77848e]">{title}</p>
    <div className="mt-2 min-h-8 text-xl font-bold text-[#f4f7f8]">
      {!metric.available
        ? <span className="text-sm font-medium text-[#788691]">Bağlı veri yok</span>
        : metric.amounts.length
          ? metric.amounts.map((item) => <p key={item.currency}>{formatMoney(item.amount, item.currency)}</p>)
          : formatMoney(0, "TRY")}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-[#788691]">{metric.note}</p>
  </div>;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
}
