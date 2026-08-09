import type { AccountingSummary } from "@/lib/accounting/accounting-summary";
import type { ExpenseContext, ExpenseIntelligence } from "@/lib/core/expenses";
import type { FinancialHealthIntelligence } from "@/lib/financial-health-intelligence";
import { AccountingSummarySurface } from "./AccountingSummarySurface";

export type FinanceSummaryPayload = Readonly<{ accountingSummary: AccountingSummary; expenseContext: ExpenseContext; expenseIntelligence: ExpenseIntelligence; financialHealthIntelligence: FinancialHealthIntelligence }>;

export function FinanceSummarySurface({ summary }: { summary: FinanceSummaryPayload }) {
  const health = summary.financialHealthIntelligence; const expense = summary.expenseIntelligence;
  return <div className="space-y-4" data-testid="finance-summary">
    <section aria-labelledby="finance-accounting-heading"><h2 className="mb-3 text-sm font-semibold text-[#EDE7D9]" id="finance-accounting-heading">Muhasebe Gerçekleri</h2><AccountingSummarySurface summary={summary.accountingSummary}/></section>
    <section aria-labelledby="financial-health-heading" className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4">
      <h2 className="text-sm font-semibold text-[#EDE7D9]" id="financial-health-heading">Finansal Sağlık</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><Measure label="Seviye" value={health.financialHealthLevel}/><Measure label="Nakit Baskısı" value={health.cashPressureLevel}/><Measure label="Tahsilat Kapsama Oranı" value={health.collectionCoverageRatio === null ? "Hesaplanamadı" : `%${Math.round(health.collectionCoverageRatio * 100)}`}/></div>
      <p className="mt-4 text-sm leading-6 text-[#C9BFA8]">{health.executiveSummary}</p><List title="Risk Uyarıları" items={health.riskWarnings}/><List title="Önerilen Aksiyonlar" items={health.recommendedActions}/><p className="mt-3 text-[11px] text-[#7C7466]">Güven: {health.confidence}</p>
    </section>
    <section aria-labelledby="expense-risk-heading" className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4">
      <h2 className="text-sm font-semibold text-[#EDE7D9]" id="expense-risk-heading">Gider Riski</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><Measure label="Risk Seviyesi" value={expense.burnRiskLevel}/><Measure label="Aylık Yanma Hızı" value={formatMoney(expense.monthlyBurnRate)}/><Measure label="Gecikmiş Kayıt" value={String(summary.expenseContext.overdueCount)}/></div>
      <div className="mt-4"><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">Kategori Kırılımı</p>{summary.expenseContext.categoryBreakdown.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{summary.expenseContext.categoryBreakdown.map((item) => <li key={item.category} className="text-sm text-[#C9BFA8]">{item.category}: {formatMoney(item.total)} · {item.count} kayıt</li>)}</ul> : <p className="mt-2 text-sm text-[#7C7466]">Gider kaydı bulunamadı.</p>}</div><List title="Risk Uyarıları" items={expense.riskWarnings}/>
    </section>
  </div>;
}
function Measure({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">{label}</p><p className="mt-1 text-lg font-bold text-[#F4F7F8]">{value}</p></div>; }
function List({ title, items }: { title: string; items: readonly string[] }) { return items.length ? <div className="mt-4"><p className="text-[10px] uppercase tracking-wider text-[#7C7466]">{title}</p><ul className="mt-2 space-y-1 text-sm leading-5 text-[#C9BFA8]">{items.map((item) => <li key={item}>• {item}</li>)}</ul></div> : null; }
function formatMoney(amount: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount); }
