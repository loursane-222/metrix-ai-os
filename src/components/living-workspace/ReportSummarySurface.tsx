import type { ExecutiveReport, ReportConfidence, ReportSection } from "@/lib/executive-reporting/executive-reporting.types";

const CONFIDENCE_LABEL: Record<ReportConfidence, string> = { HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Düşük" };
const STATUS_LABEL: Record<ReportSection["status"], string> = { GENERATED: "Üretildi", INSUFFICIENT_DATA: "Yetersiz Veri", FALLBACK: "Varsayılan Özet" };

export function ReportSummarySurface({ report, generatedAt }: { report: ExecutiveReport; generatedAt: string }) {
  return <div className="space-y-4" data-testid="report-summary">
    <section className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#EDE7D9]">{report.title}</h2>
          <p className="mt-1 text-[11px] text-[#7C7466]">Üretim zamanı: {new Date(generatedAt).toLocaleString("tr-TR")}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/[.1] px-3 py-1 text-[11px] font-semibold text-[#C9BFA8]">Güven: {CONFIDENCE_LABEL[report.overallConfidence]}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#C9BFA8]">{report.executiveSummary}</p>
      {report.dataQualityNote ? <p className="mt-3 text-[11px] leading-5 text-[#7C7466]">{report.dataQualityNote}</p> : null}
    </section>
    <div className="space-y-3">
      {report.sections.map((section) => <ReportSectionCard key={section.sectionId} section={section}/>)}
    </div>
  </div>;
}

function ReportSectionCard({ section }: { section: ReportSection }) {
  return <section aria-labelledby={`report-section-${section.sectionId}`} className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-[#EDE7D9]" id={`report-section-${section.sectionId}`}>{section.title}</h3>
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-[#7C7466]">{STATUS_LABEL[section.status]} · {CONFIDENCE_LABEL[section.confidence]}</span>
    </div>
    <p className="mt-2 text-sm leading-6 text-[#C9BFA8]">{section.summary}</p>
    {section.findings.length ? <ul className="mt-3 space-y-1.5">{section.findings.map((finding) => <li className="flex items-baseline justify-between gap-3 text-sm" key={finding.label}><span className="text-[#7C7466]">{finding.label}</span><span className="font-semibold text-[#F4F7F8]">{finding.value}</span></li>)}</ul> : null}
    {section.dataNote ? <p className="mt-3 text-[11px] leading-5 text-[#7C7466]">{section.dataNote}</p> : null}
  </section>;
}
