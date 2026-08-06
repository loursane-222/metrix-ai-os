import type { ReportConfidence, ReportSection, ReportType } from "./executive-reporting.types";

export const REPORT_TYPE_TITLE: Record<ReportType, string> = {
  EXECUTIVE_SUMMARY: "Yonetici Ozet Raporu",
  RISK: "Risk Degerlendirme Raporu",
  COLLECTION: "Tahsilat Durum Raporu",
  SALES_PERFORMANCE: "Satis Performans Raporu",
  WEEKLY_EXECUTIVE: "Haftalik Yonetici Raporu",
  MONTHLY_EXECUTIVE: "Aylik Yonetici Raporu",
  CUSTOM_DATE_RANGE: "Ozet Tarih Aralikli Rapor",
};

export function resolveReportTitle(reportType: ReportType): string {
  return REPORT_TYPE_TITLE[reportType];
}

export function resolveOverallConfidence(sections: ReportSection[]): ReportConfidence {
  const RANK: Record<ReportConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const generated = sections.filter((s) => s.status === "GENERATED");
  if (generated.length === 0) return "LOW";
  const avg = generated.reduce((sum, s) => sum + RANK[s.confidence], 0) / generated.length;
  return avg >= 1.5 ? "HIGH" : avg >= 0.75 ? "MEDIUM" : "LOW";
}

export function buildDataQualityNote(
  failedSteps: string[],
  isFallback: boolean,
  reportType: ReportType,
): string | null {
  if (failedSteps.length > 0) {
    return `Bazı veri adımları okunamadı: ${failedSteps.slice(0, 3).join(", ")}.`;
  }
  if (isFallback) {
    return `"${REPORT_TYPE_TITLE[reportType]}" için yeterli kaynak veri henüz mevcut değil; özet sınırlı veriyle üretildi.`;
  }
  return null;
}

export function sectionConfidenceFromFindings(
  findingCount: number,
  hasPrimarySource: boolean,
): ReportConfidence {
  if (!hasPrimarySource) return "LOW";
  if (findingCount >= 3) return "HIGH";
  if (findingCount >= 1) return "MEDIUM";
  return "LOW";
}

export function insufficientSection(sectionId: string, title: string): ReportSection {
  return {
    sectionId,
    title,
    summary: "Bu bölüm için yeterli veri bulunamadı.",
    findings: [],
    confidence: "LOW",
    status: "INSUFFICIENT_DATA",
    dataNote: "Veri kaynağı eksik veya sıfır kayıt.",
  };
}

export function fallbackSection(sectionId: string, title: string, summary: string): ReportSection {
  return {
    sectionId,
    title,
    summary,
    findings: [],
    confidence: "LOW",
    status: "FALLBACK",
    dataNote: "Bu bölüm için yeterli bilgi mevcut değil; varsayılan özet kullanıldı.",
  };
}
