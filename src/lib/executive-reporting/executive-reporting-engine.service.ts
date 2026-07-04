import type {
  BuildExecutiveReportInput,
  ExecutiveReport,
  ReportFinding,
  ReportSection,
  ReportSignificance,
} from "./executive-reporting.types";
import {
  buildDataQualityNote,
  fallbackSection,
  insufficientSection,
  resolveOverallConfidence,
  resolveReportTitle,
  sectionConfidenceFromFindings,
} from "./executive-reporting-summary.service";

export function buildExecutiveReport(input: BuildExecutiveReportInput): ExecutiveReport {
  switch (input.reportType) {
    case "EXECUTIVE_SUMMARY":
      return buildExecutiveSummaryReport(input);
    case "RISK":
      return buildRiskReport(input);
    case "COLLECTION":
      return buildCollectionReport(input);
    case "SALES_PERFORMANCE":
      return buildSalesPerformanceReport(input);
    case "MONTHLY_EXECUTIVE":
      return buildMonthlyExecutiveReport(input);
    default:
      return buildGenericFallbackReport(input);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// EXECUTIVE SUMMARY
// ──────────────────────────────────────────────────────────────────────────────

function buildExecutiveSummaryReport(input: BuildExecutiveReportInput): ExecutiveReport {
  const sections: ReportSection[] = [
    buildCompanyHealthSection(input),
    buildCouncilPositionSection(input),
    buildCriticalRisksSection(input),
  ];

  const isFallback = sections.every((s) => s.status !== "GENERATED");
  const overallConfidence = resolveOverallConfidence(sections);

  return {
    reportType: input.reportType,
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    title: resolveReportTitle(input.reportType),
    executiveSummary: resolveExecutiveSummaryLine(input),
    sections,
    overallConfidence,
    dataQualityNote: buildDataQualityNote(input.failedSteps ?? [], isFallback, input.reportType),
    isFallback,
  };
}

function buildCompanyHealthSection(input: BuildExecutiveReportInput): ReportSection {
  const { executiveScorecard: scorecard, executiveForecast: forecast, executiveAlerts: alerts } = input;

  if (!scorecard && !forecast && !alerts) {
    return insufficientSection("company_health", "Genel Sirket Sagligi");
  }

  const findings: ReportFinding[] = [];

  if (scorecard) {
    findings.push({
      label: "Genel saglik seviyesi",
      value: translateScorecardLevel(scorecard.overallLevel),
      significance: scorecardLevelToSignificance(scorecard.overallLevel),
    });
    if (scorecard.weakestArea) {
      findings.push({
        label: "En zayif alan",
        value: translateScorecardArea(scorecard.weakestArea),
        significance: "HIGH",
      });
    }
    if (scorecard.strongestArea) {
      findings.push({
        label: "En guclu alan",
        value: translateScorecardArea(scorecard.strongestArea),
        significance: "LOW",
      });
    }
  }

  if (forecast) {
    findings.push({
      label: "Tahmin risk seviyesi",
      value: translateForecastRiskLevel(forecast.overallRiskLevel),
      significance: forecastRiskToSignificance(forecast.overallRiskLevel),
    });
  }

  if (alerts && (alerts.criticalAlerts.length > 0 || alerts.highAlerts.length > 0)) {
    findings.push({
      label: "Kritik/yuksek uyari",
      value: `${alerts.criticalAlerts.length} kritik, ${alerts.highAlerts.length} yuksek`,
      significance: alerts.criticalAlerts.length > 0 ? "HIGH" : "MEDIUM",
    });
  }

  return {
    sectionId: "company_health",
    title: "Genel Sirket Sagligi",
    summary: scorecard?.summary ?? forecast?.executiveSummary ?? "Yeterli veriyle degerlendirme uretildi.",
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(scorecard || forecast)),
    status: "GENERATED",
    dataNote: scorecard?.dataQualityNote ?? null,
  };
}

function buildCouncilPositionSection(input: BuildExecutiveReportInput): ReportSection {
  const { executiveCouncilSynthesis: council, directorOpinionBundle: bundle } = input;

  if (!council && !bundle) {
    return insufficientSection("council_position", "Konsey ve Yonetim Pozisyonu");
  }

  const findings: ReportFinding[] = [];

  if (council) {
    findings.push({
      label: "Konsey pozisyonu",
      value: translateCouncilPosition(council.councilPosition),
      significance: councilPositionToSignificance(council.councilPosition),
    });
    if (council.consensusItems.length > 0) {
      findings.push({
        label: "En yuksek mutabakat",
        value: council.consensusItems[0]!.title,
        significance: urgencyToSignificance(council.consensusItems[0]!.urgency),
      });
    }
    if (council.recommendedActions.length > 0) {
      findings.push({
        label: "Oncelikli aksiyon",
        value: council.recommendedActions[0]!.title,
        significance: urgencyToSignificance(council.recommendedActions[0]!.urgency),
      });
    }
  } else if (bundle) {
    const topConcern = bundle.topConcerns[0];
    if (topConcern) {
      findings.push({
        label: "En kritik endise",
        value: topConcern,
        significance: "HIGH",
      });
    }
  }

  const summary = council
    ? `Konsey pozisyonu: ${translateCouncilPosition(council.councilPosition)}. ${council.recommendedExecutiveStance.rationale}`
    : `${bundle!.opinions.length} direktor ozeti mevcut. Ust konsey sentezi henuz uretilmedi.`;

  return {
    sectionId: "council_position",
    title: "Konsey ve Yonetim Pozisyonu",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(council || bundle)),
    status: "GENERATED",
    dataNote: null,
  };
}

function buildCriticalRisksSection(input: BuildExecutiveReportInput): ReportSection {
  const { executiveAlerts: alerts, executiveForecast: forecast, executiveCouncilSynthesis: council } = input;

  if (!alerts && !forecast && !council) {
    return insufficientSection("critical_risks", "Kritik Riskler ve Aksiyonlar");
  }

  const findings: ReportFinding[] = [];

  if (alerts && alerts.criticalAlerts.length > 0) {
    const top = alerts.criticalAlerts[0]!;
    findings.push({ label: "Kritik uyari", value: top.headline, significance: "HIGH" });
    if (top.actionableStep) {
      findings.push({ label: "Onerien adim", value: top.actionableStep, significance: "HIGH" });
    }
  }

  if (forecast && forecast.signals.length > 0) {
    const topSignal = forecast.signals.find(
      (s) => s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH",
    );
    if (topSignal) {
      findings.push({
        label: "On plan riski",
        value: topSignal.headline,
        significance: forecastRiskToSignificance(topSignal.riskLevel),
      });
    }
  }

  if (council && council.unresolvedQuestions.length > 0) {
    findings.push({
      label: "Acik yonetim sorusu",
      value: council.unresolvedQuestions[0]!.title,
      significance: "MEDIUM",
    });
  }

  const critCount = alerts?.criticalAlerts.length ?? 0;
  const highCount = alerts?.highAlerts.length ?? 0;
  const summary =
    critCount > 0
      ? `${critCount} kritik seviye uyari aktif. Hemen mudahale gerektirebilir.`
      : highCount > 0
        ? `${highCount} yuksek seviye uyari izlemede. Kisa vadeli takip onerilir.`
        : forecast?.executiveSummary ?? "Aktif kritik uyari tespit edilmedi.";

  return {
    sectionId: "critical_risks",
    title: "Kritik Riskler ve Aksiyonlar",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(alerts || forecast)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: null,
  };
}

function resolveExecutiveSummaryLine(input: BuildExecutiveReportInput): string {
  if (input.executiveNarrative?.executiveSummary) return input.executiveNarrative.executiveSummary;
  if (input.executiveScorecard?.summary) return input.executiveScorecard.summary;
  if (input.executiveForecast?.executiveSummary) return input.executiveForecast.executiveSummary;
  return "Yonetici ozeti icin yeterli guvenilir veri olusmadi.";
}

// ──────────────────────────────────────────────────────────────────────────────
// RISK
// ──────────────────────────────────────────────────────────────────────────────

function buildRiskReport(input: BuildExecutiveReportInput): ExecutiveReport {
  const sections: ReportSection[] = [
    buildFinancialRiskSection(input),
    buildCollectionRiskSection(input),
    buildPipelineRiskSection(input),
  ];

  const isFallback = sections.every((s) => s.status !== "GENERATED");
  const overallConfidence = resolveOverallConfidence(sections);

  const executiveSummary =
    input.executiveForecast?.executiveSummary ??
    (input.executiveAlerts && input.executiveAlerts.criticalAlerts.length > 0
      ? `${input.executiveAlerts.criticalAlerts.length} kritik risk uyarisi aktif.`
      : "Risk degerlendirmesi icin yeterli guvenilir kaynak verisi yok.");

  return {
    reportType: input.reportType,
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    title: resolveReportTitle(input.reportType),
    executiveSummary,
    sections,
    overallConfidence,
    dataQualityNote: buildDataQualityNote(input.failedSteps ?? [], isFallback, input.reportType),
    isFallback,
  };
}

function buildFinancialRiskSection(input: BuildExecutiveReportInput): ReportSection {
  const { executiveForecast: forecast, executiveAlerts: alerts, signalTrendContext: trend } = input;

  if (!forecast && !alerts && !trend) {
    return insufficientSection("financial_risk", "Finansal Risk");
  }

  const cashSignals = forecast?.signals.filter((s) => s.riskType === "CASH_FLOW") ?? [];
  const cashAlerts = [
    ...(alerts?.criticalAlerts.filter((a) => a.category === "CASH_FLOW_RISK") ?? []),
    ...(alerts?.highAlerts.filter((a) => a.category === "CASH_FLOW_RISK") ?? []),
  ];

  const findings: ReportFinding[] = [];

  if (forecast) {
    findings.push({
      label: "Genel risk seviyesi",
      value: translateForecastRiskLevel(forecast.overallRiskLevel),
      significance: forecastRiskToSignificance(forecast.overallRiskLevel),
    });
  }

  for (const signal of cashSignals.slice(0, 2)) {
    findings.push({
      label: "Nakit akisi riski",
      value: signal.headline,
      significance: forecastRiskToSignificance(signal.riskLevel),
    });
  }

  for (const alert of cashAlerts.slice(0, 2)) {
    findings.push({ label: "Finansal uyari", value: alert.headline, significance: "HIGH" });
  }

  if (trend?.hasData) {
    findings.push({
      label: "Sinyal trendi",
      value: translateTrendDirection(trend.trendDirection),
      significance: trend.trendDirection === "RISING" ? "HIGH" : "LOW",
    });
  }

  return {
    sectionId: "financial_risk",
    title: "Finansal Risk",
    summary: forecast?.executiveSummary ?? "Finansal risk tahmini icin yeterli veri yok.",
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(forecast)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: forecast?.dataQualityNote ?? null,
  };
}

function buildCollectionRiskSection(input: BuildExecutiveReportInput): ReportSection {
  const { paymentIntelligence: payment, executiveForecast: forecast, executiveAlerts: alerts } = input;

  const collectionSignals = forecast?.signals.filter((s) => s.riskType === "COLLECTION_RISK") ?? [];
  const collectionAlerts = [
    ...(alerts?.criticalAlerts.filter((a) => a.category === "COLLECTION_PRESSURE") ?? []),
    ...(alerts?.highAlerts.filter((a) => a.category === "COLLECTION_PRESSURE") ?? []),
  ];

  if (!payment && collectionSignals.length === 0 && collectionAlerts.length === 0) {
    return insufficientSection("collection_risk", "Tahsilat Riski");
  }

  const findings: ReportFinding[] = [];

  if (payment) {
    findings.push({
      label: "Tahsilat baskisi",
      value: translateCollectionPressure(payment.collectionPressure),
      significance: collectionPressureToSignificance(payment.collectionPressure),
    });
    findings.push({
      label: "Gecikme orani",
      value: `%${Math.round(payment.overdueRatio * 100)}`,
      significance: payment.overdueRatio >= 0.5 ? "HIGH" : payment.overdueRatio >= 0.25 ? "MEDIUM" : "LOW",
    });
    if (payment.hasActiveRisk) {
      findings.push({
        label: "Aktif risk",
        value: payment.executiveSummary,
        significance: "HIGH",
      });
    }
  }

  for (const signal of collectionSignals.slice(0, 1)) {
    findings.push({
      label: "Tahsilat risk sinyali",
      value: signal.headline,
      significance: forecastRiskToSignificance(signal.riskLevel),
    });
  }

  return {
    sectionId: "collection_risk",
    title: "Tahsilat Riski",
    summary: payment?.executiveSummary ?? collectionSignals[0]?.headline ?? "Tahsilat riski degerlendirmesi.",
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(payment)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: null,
  };
}

function buildPipelineRiskSection(input: BuildExecutiveReportInput): ReportSection {
  const { quoteIntelligence: quote, executiveForecast: forecast, executiveAlerts: alerts } = input;

  const quoteSignals = forecast?.signals.filter((s) => s.riskType === "QUOTE_CONVERSION") ?? [];
  const quoteAlerts = [
    ...(alerts?.criticalAlerts.filter((a) => a.category === "QUOTE_PIPELINE_RISK") ?? []),
    ...(alerts?.highAlerts.filter((a) => a.category === "QUOTE_PIPELINE_RISK") ?? []),
  ];

  if (!quote && quoteSignals.length === 0 && quoteAlerts.length === 0) {
    return insufficientSection("pipeline_risk", "Pipeline Riski");
  }

  const findings: ReportFinding[] = [];

  if (quote) {
    findings.push({
      label: "Teklif risk seviyesi",
      value: translateQuoteRiskLevel(quote.quoteRiskLevel),
      significance: quoteRiskToSignificance(quote.quoteRiskLevel),
    });
    if (quote.staleQuoteCount > 0) {
      findings.push({
        label: "Eskimis teklif",
        value: `${quote.staleQuoteCount} adet`,
        significance: quote.staleQuoteCount >= 3 ? "HIGH" : "MEDIUM",
      });
    }
    if (quote.hotQuoteCount > 0) {
      findings.push({
        label: "Sicak teklif",
        value: `${quote.hotQuoteCount} adet`,
        significance: "LOW",
      });
    }
  }

  for (const signal of quoteSignals.slice(0, 1)) {
    findings.push({
      label: "Donusum riski",
      value: signal.headline,
      significance: forecastRiskToSignificance(signal.riskLevel),
    });
  }

  return {
    sectionId: "pipeline_risk",
    title: "Pipeline Riski",
    summary: quote?.executiveSummary ?? quoteSignals[0]?.headline ?? "Pipeline riski degerlendirmesi.",
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(quote)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// COLLECTION
// ──────────────────────────────────────────────────────────────────────────────

function buildCollectionReport(input: BuildExecutiveReportInput): ExecutiveReport {
  const sections: ReportSection[] = [
    buildReceivablesStatusSection(input),
    buildCollectionActionsSection(input),
    buildCollectionRiskAssessmentSection(input),
  ];

  const isFallback = sections.every((s) => s.status !== "GENERATED");
  const overallConfidence = resolveOverallConfidence(sections);

  const executiveSummary = resolveCollectionReportSummary(input);

  return {
    reportType: input.reportType,
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    title: resolveReportTitle(input.reportType),
    executiveSummary,
    sections,
    overallConfidence,
    dataQualityNote: buildDataQualityNote(input.failedSteps ?? [], isFallback, input.reportType),
    isFallback,
  };
}

function buildReceivablesStatusSection(input: BuildExecutiveReportInput): ReportSection {
  const ctx = input.paymentContext;

  if (!ctx) {
    return insufficientSection("receivables_status", "Alacak Durumu");
  }

  const findings: ReportFinding[] = [];

  findings.push({
    label: "Toplam alacak",
    value: formatAmount(ctx.totalReceivable),
    significance: "MEDIUM",
  });

  if (ctx.totalOverdue > 0) {
    findings.push({
      label: "Vadesi gecmis",
      value: formatAmount(ctx.totalOverdue),
      significance: ctx.overdueCount >= 5 ? "HIGH" : "MEDIUM",
    });
    findings.push({
      label: "Gecikme adedi",
      value: `${ctx.overdueCount} fatura`,
      significance: ctx.overdueCount >= 5 ? "HIGH" : "MEDIUM",
    });
  }

  if (ctx.partialCount > 0) {
    findings.push({
      label: "Kismi odeme",
      value: `${ctx.partialCount} fatura`,
      significance: "LOW",
    });
  }

  const summary =
    ctx.totalOverdue > 0
      ? `Toplam ${formatAmount(ctx.totalOverdue)} vadesi gecmis alacak var; ${ctx.overdueCount} adet.`
      : "Vadesi gecmis alacak bulunmuyor.";

  return {
    sectionId: "receivables_status",
    title: "Alacak Durumu",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, true),
    status: "GENERATED",
    dataNote: null,
  };
}

function buildCollectionActionsSection(input: BuildExecutiveReportInput): ReportSection {
  const ctx = input.collectionActionContext;

  if (!ctx) {
    return insufficientSection("collection_actions", "Tahsilat Aksiyonlari");
  }

  const findings: ReportFinding[] = [];

  findings.push({
    label: "Acik aksiyon",
    value: `${ctx.openCount} adet`,
    significance: ctx.openCount >= 5 ? "HIGH" : "MEDIUM",
  });

  if (ctx.inProgressCount > 0) {
    findings.push({
      label: "Devam eden aksiyon",
      value: `${ctx.inProgressCount} adet`,
      significance: "LOW",
    });
  }

  const stale14 = ctx.items.filter((item) => item.status === "OPEN" && item.daysOpen >= 14);
  const stale7 = ctx.items.filter((item) => item.status === "OPEN" && item.daysOpen >= 7);

  if (stale14.length > 0) {
    findings.push({
      label: "14+ gun bekleyen aksiyon",
      value: `${stale14.length} adet`,
      significance: "HIGH",
    });
  } else if (stale7.length > 0) {
    findings.push({
      label: "7+ gun bekleyen aksiyon",
      value: `${stale7.length} adet`,
      significance: "MEDIUM",
    });
  }

  const summary =
    ctx.openCount === 0
      ? "Aktif tahsilat aksiyonu yok."
      : `${ctx.openCount} acik, ${ctx.inProgressCount} devam eden tahsilat aksiyonu takipte.`;

  return {
    sectionId: "collection_actions",
    title: "Tahsilat Aksiyonlari",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, true),
    status: "GENERATED",
    dataNote: null,
  };
}

function buildCollectionRiskAssessmentSection(input: BuildExecutiveReportInput): ReportSection {
  const payment = input.paymentIntelligence;

  if (!payment) {
    return insufficientSection("collection_risk_assessment", "Risk Degerlendirmesi");
  }

  const findings: ReportFinding[] = [];

  findings.push({
    label: "Nakit riski",
    value: translateCashRiskLevel(payment.cashRiskLevel),
    significance: cashRiskToSignificance(payment.cashRiskLevel),
  });

  findings.push({
    label: "Tahsilat baskisi",
    value: translateCollectionPressure(payment.collectionPressure),
    significance: collectionPressureToSignificance(payment.collectionPressure),
  });

  if (payment.topPriorityItem) {
    findings.push({
      label: "En oncelikli musteri",
      value: payment.topPriorityItem.customerName,
      significance: "HIGH",
    });
  }

  if (payment.riskWarnings.length > 0) {
    findings.push({
      label: "Risk uyarisi",
      value: payment.riskWarnings[0]!,
      significance: "HIGH",
    });
  }

  return {
    sectionId: "collection_risk_assessment",
    title: "Risk Degerlendirmesi",
    summary: payment.executiveSummary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, true),
    status: "GENERATED",
    dataNote: null,
  };
}

function resolveCollectionReportSummary(input: BuildExecutiveReportInput): string {
  if (input.paymentIntelligence) return input.paymentIntelligence.executiveSummary;
  const ctx = input.paymentContext;
  if (ctx) {
    return ctx.totalOverdue > 0
      ? `${formatAmount(ctx.totalOverdue)} vadesi gecmis alacak mevcut.`
      : "Gecikme yok; tahsilat durumu normal.";
  }
  return "Tahsilat durumu icin yeterli veri bulunamadi.";
}

// ──────────────────────────────────────────────────────────────────────────────
// SALES PERFORMANCE (V1 limited; fallback-capable)
// ──────────────────────────────────────────────────────────────────────────────

function buildSalesPerformanceReport(input: BuildExecutiveReportInput): ExecutiveReport {
  const { quoteIntelligence: quote, quoteContext: quoteCtx } = input;

  const hasSalesData = Boolean(quote || quoteCtx);
  const sections: ReportSection[] = hasSalesData
    ? [buildSalesPipelineSummarySection(input)]
    : [
        fallbackSection(
          "sales_pipeline",
          "Satis Pipeline Ozeti",
          "Teklif verisi mevcut degil; satis performans raporu henuz desteklenmiyor.",
        ),
      ];

  const isFallback = sections.every((s) => s.status !== "GENERATED");
  const overallConfidence = resolveOverallConfidence(sections);

  return {
    reportType: input.reportType,
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    title: resolveReportTitle(input.reportType),
    executiveSummary: quote?.executiveSummary ?? "Satis performans raporu sinirli veriyle uretildi.",
    sections,
    overallConfidence,
    dataQualityNote: buildDataQualityNote(input.failedSteps ?? [], isFallback, input.reportType),
    isFallback,
  };
}

function buildSalesPipelineSummarySection(input: BuildExecutiveReportInput): ReportSection {
  const { quoteIntelligence: quote, quoteContext: ctx } = input;

  const findings: ReportFinding[] = [];

  if (quote) {
    findings.push({
      label: "Aktif teklif sayisi",
      value: `${quote.activeQuoteCount}`,
      significance: "MEDIUM",
    });
    findings.push({
      label: "Acik teklif degeri",
      value: formatAmount(quote.totalOpenQuoteValue),
      significance: "MEDIUM",
    });
    if (quote.staleQuoteCount > 0) {
      findings.push({
        label: "Eskimis teklif",
        value: `${quote.staleQuoteCount} adet`,
        significance: "HIGH",
      });
    }
  } else if (ctx) {
    findings.push({
      label: "Acik teklif adedi",
      value: `${ctx.openCount}`,
      significance: "MEDIUM",
    });
    findings.push({
      label: "Acik teklif degeri",
      value: formatAmount(ctx.openTotal),
      significance: "MEDIUM",
    });
  }

  return {
    sectionId: "sales_pipeline",
    title: "Satis Pipeline Ozeti",
    summary: quote?.quotePipelineSummary ?? "Teklif pipeline ozeti mevcut.",
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(quote)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// MONTHLY EXECUTIVE
// ──────────────────────────────────────────────────────────────────────────────

function buildMonthlyExecutiveReport(input: BuildExecutiveReportInput): ExecutiveReport {
  const sections: ReportSection[] = [
    buildMonthlyExecutiveSummarySection(input),
    buildMonthlyGoalAchievementSection(input),
    buildMonthlyBiggestRiskSection(input),
    buildMonthlyBiggestStrengthSection(input),
    buildMonthlyDecisionDisciplineSection(input),
    buildMonthlyFinancialHealthSection(input),
    buildMonthlyManagementFocusSection(input),
  ];

  const isFallback = sections.every((s) => s.status !== "GENERATED");
  const overallConfidence = resolveOverallConfidence(sections);

  const executiveSummary =
    input.companyPerformanceSignal?.executiveSummary ??
    input.executiveScorecard?.summary ??
    input.executiveForecast?.executiveSummary ??
    "Aylik yonetici raporu sinirli veriyle uretildi.";

  return {
    reportType: input.reportType,
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    title: resolveReportTitle(input.reportType),
    executiveSummary,
    sections,
    overallConfidence,
    dataQualityNote: buildDataQualityNote(input.failedSteps ?? [], isFallback, input.reportType),
    isFallback,
  };
}

function buildMonthlyExecutiveSummarySection(input: BuildExecutiveReportInput): ReportSection {
  const cps = input.companyPerformanceSignal;
  const scorecard = input.executiveScorecard;

  if (!cps && !scorecard) {
    return insufficientSection("monthly_executive_summary", "Yonetici Ozeti");
  }

  const findings: ReportFinding[] = [];

  if (cps) {
    findings.push({
      label: "Sirket performans seviyesi",
      value: translateCompanyPerformanceLevel(cps.performanceLevel),
      significance: companyPerformanceLevelToSignificance(cps.performanceLevel),
    });
    findings.push({
      label: "Performans ivmesi",
      value: translateCompanyPerformanceMomentum(cps.momentum),
      significance: cps.momentum === "DECELERATING" ? "HIGH" : "LOW",
    });
  }

  if (scorecard) {
    findings.push({
      label: "Operasyonel saglik",
      value: translateScorecardLevel(scorecard.overallLevel),
      significance: scorecardLevelToSignificance(scorecard.overallLevel),
    });
  }

  const summary =
    cps?.executiveSummary ??
    scorecard?.summary ??
    "Sirket genel durumu degerlendiriliyor.";

  return {
    sectionId: "monthly_executive_summary",
    title: "Yonetici Ozeti",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(cps || scorecard)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: cps?.confidence === "LOW" ? "Sirket performans verisi dusuk guvenle uretildi." : null,
  };
}

function buildMonthlyGoalAchievementSection(input: BuildExecutiveReportInput): ReportSection {
  const proj = input.executiveForecast?.projection;

  if (
    !proj?.monthlyTarget ||
    proj.forecastedMonthEndRevenue === undefined ||
    proj.goalAchievementRate === undefined
  ) {
    return insufficientSection("monthly_goal_achievement", "Hedef Gerceklesme");
  }

  const ratePct = Math.round(proj.goalAchievementRate * 100);
  const onTrack = !proj.goalGap || proj.goalGap <= 0;

  const findings: ReportFinding[] = [
    {
      label: "Aylik hedef",
      value: `₺${proj.monthlyTarget.toLocaleString("tr-TR")}`,
      significance: "HIGH",
    },
    {
      label: "Ay sonu tahmini",
      value: `₺${proj.forecastedMonthEndRevenue.toLocaleString("tr-TR")}`,
      significance: "HIGH",
    },
    {
      label: "Gerceklesme orani",
      value: `%${ratePct}`,
      significance: proj.goalAchievementRate >= 0.9 ? "LOW" : proj.goalAchievementRate >= 0.75 ? "MEDIUM" : "HIGH",
    },
  ];

  if (!onTrack && proj.goalGap) {
    findings.push({
      label: "Hedef acigi",
      value: `₺${proj.goalGap.toLocaleString("tr-TR")}`,
      significance: proj.goalAchievementRate < 0.75 ? "HIGH" : "MEDIUM",
    });
  }

  const summary = onTrack
    ? `Ay sonu tahmini %${ratePct} gerceklesme; hedefe ulasilmasi bekleniyor.`
    : `Ay sonu tahmini %${ratePct} gerceklesme; ₺${proj.goalGap!.toLocaleString("tr-TR")} hedef acigi bekleniyor.`;

  return {
    sectionId: "monthly_goal_achievement",
    title: "Hedef Gerceklesme",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, true),
    status: "GENERATED",
    dataNote: null,
  };
}

function buildMonthlyBiggestRiskSection(input: BuildExecutiveReportInput): ReportSection {
  const cps = input.companyPerformanceSignal;
  const scorecard = input.executiveScorecard;
  const forecast = input.executiveForecast;
  const alerts = input.executiveAlerts;

  if (!cps && !scorecard && !forecast && !alerts) {
    return insufficientSection("monthly_biggest_risk", "En Buyuk Risk");
  }

  const findings: ReportFinding[] = [];

  if (cps?.primaryRisk) {
    findings.push({
      label: "One cikan risk",
      value: cps.primaryRisk,
      significance: companyPerformanceLevelToSignificance(cps.performanceLevel),
    });
  }

  if (scorecard?.weakestArea) {
    findings.push({
      label: "En zayif alan",
      value: translateScorecardArea(scorecard.weakestArea),
      significance: "HIGH",
    });
  }

  if (forecast) {
    findings.push({
      label: "On plan risk seviyesi",
      value: translateForecastRiskLevel(forecast.overallRiskLevel),
      significance: forecastRiskToSignificance(forecast.overallRiskLevel),
    });
  }

  if (alerts && (alerts.criticalAlerts.length > 0 || alerts.highAlerts.length > 0)) {
    findings.push({
      label: "Aktif uyari",
      value: `${alerts.criticalAlerts.length} kritik, ${alerts.highAlerts.length} yuksek`,
      significance: alerts.criticalAlerts.length > 0 ? "HIGH" : "MEDIUM",
    });
  }

  const summary =
    cps?.primaryRisk ??
    (scorecard?.weakestArea ? `En zayif alan: ${translateScorecardArea(scorecard.weakestArea)}` : null) ??
    forecast?.executiveSummary ??
    "Risk degerlendirmesi sinirli veriyle uretildi.";

  return {
    sectionId: "monthly_biggest_risk",
    title: "En Buyuk Risk",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(cps || scorecard || forecast)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: null,
  };
}

function buildMonthlyBiggestStrengthSection(input: BuildExecutiveReportInput): ReportSection {
  const cps = input.companyPerformanceSignal;
  const scorecard = input.executiveScorecard;

  const hasStrength = Boolean(cps?.primaryStrength || scorecard?.strongestArea);

  if (!cps && !scorecard) {
    return insufficientSection("monthly_biggest_strength", "En Guclu Alan");
  }

  const findings: ReportFinding[] = [];

  if (cps?.primaryStrength) {
    findings.push({
      label: "One cikan guc",
      value: cps.primaryStrength,
      significance: "LOW",
    });
  }

  if (scorecard?.strongestArea) {
    findings.push({
      label: "En guclu alan",
      value: translateScorecardArea(scorecard.strongestArea),
      significance: "LOW",
    });
  }

  const summary =
    cps?.primaryStrength ??
    (scorecard?.strongestArea ? `Guclu alan: ${translateScorecardArea(scorecard.strongestArea)}` : null) ??
    "Bu donemde one cikan guclu alan tespit edilemedi.";

  return {
    sectionId: "monthly_biggest_strength",
    title: "En Guclu Alan",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(cps || scorecard)),
    status: hasStrength ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: null,
  };
}

function buildMonthlyDecisionDisciplineSection(input: BuildExecutiveReportInput): ReportSection {
  const agg = input.outcomeAggregate;

  if (!agg || agg.confidence === "LOW") {
    return insufficientSection("monthly_decision_discipline", "Karar Disiplini");
  }

  const findings: ReportFinding[] = [];

  findings.push({
    label: "Karar kalitesi",
    value: translateQualitySignal(agg.qualitySignal),
    significance: qualitySignalToSignificance(agg.qualitySignal),
  });

  if (agg.successRate !== null) {
    findings.push({
      label: "Basari orani",
      value: `%${Math.round(agg.successRate * 100)} (${agg.successCount}/${agg.totalClosed})`,
      significance: agg.successRate >= 0.65 ? "LOW" : agg.successRate >= 0.4 ? "MEDIUM" : "HIGH",
    });
  }

  if (agg.failureRate !== null && agg.failureRate > 0) {
    findings.push({
      label: "Basarisizlik orani",
      value: `%${Math.round(agg.failureRate * 100)} (${agg.failureCount}/${agg.totalClosed})`,
      significance: agg.failureRate >= 0.4 ? "HIGH" : "MEDIUM",
    });
  }

  if (agg.repeatedFailureCount >= 1) {
    findings.push({
      label: "Tekrar eden basarisizlik",
      value: `${agg.repeatedFailureCount} karar`,
      significance: "HIGH",
    });
  }

  if (agg.reAgendaCount >= 1) {
    findings.push({
      label: "Yeniden gundeme alinan karar",
      value: `${agg.reAgendaCount} karar`,
      significance: agg.reAgendaCount >= 2 ? "HIGH" : "MEDIUM",
    });
  }

  if (agg.avgCommitToCloseDays !== null) {
    findings.push({
      label: "Ortalama karar kapama suresi",
      value: `${agg.avgCommitToCloseDays} gun`,
      significance: agg.avgCommitToCloseDays > 7 ? "MEDIUM" : "LOW",
    });
  }

  if (agg.trend !== null) {
    const deltaText =
      agg.trend.delta !== null
        ? ` (${agg.trend.delta > 0 ? "+" : ""}${Math.round(agg.trend.delta * 100)} puan)`
        : "";
    findings.push({
      label: "Karar trendi (onceki 30 gun)",
      value: translateTrendDirection(agg.trend.direction) + deltaText,
      significance:
        agg.trend.direction === "DECLINING"
          ? "HIGH"
          : agg.trend.direction === "IMPROVING"
            ? "LOW"
            : "MEDIUM",
    });
  }

  const summary =
    agg.qualitySignal === "STRONG"
      ? `Son ${agg.windowDays} gunluk karar kalitesi guclu; basari orani %${agg.successRate !== null ? Math.round(agg.successRate * 100) : "?"}.`
      : agg.qualitySignal === "WEAK"
        ? `Son ${agg.windowDays} gunluk karar kalitesi zayif; ${agg.failureCount} basarisiz karar${agg.repeatedFailureCount >= 1 ? `, ${agg.repeatedFailureCount} tekrar eden basarisizlik` : ""}.`
        : `Son ${agg.windowDays} gunluk karar disiplini izleniyor; ${agg.totalClosed} karar kapatildi.`;

  return {
    sectionId: "monthly_decision_discipline",
    title: "Karar Disiplini",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, true),
    status: "GENERATED",
    dataNote: agg.confidence === "MEDIUM" ? "Karar sayisi sinirli; istatistiksel guven orta duzeyde." : null,
  };
}

function buildMonthlyFinancialHealthSection(input: BuildExecutiveReportInput): ReportSection {
  const fhi = input.financialHealthIntelligence;
  const payment = input.paymentIntelligence;
  const paymentCtx = input.paymentContext;

  if (!fhi && !payment && !paymentCtx) {
    return insufficientSection("monthly_financial_health", "Finansal Saglik");
  }

  const findings: ReportFinding[] = [];

  if (fhi) {
    findings.push({
      label: "Finansal saglik seviyesi",
      value: translateFinancialHealthLevel(fhi.financialHealthLevel),
      significance: financialHealthLevelToSignificance(fhi.financialHealthLevel),
    });
    findings.push({
      label: "Nakit baskisi",
      value: translateFinancialHealthLevel(fhi.cashPressureLevel),
      significance: financialHealthLevelToSignificance(fhi.cashPressureLevel),
    });
    if (fhi.collectionCoverageRatio !== null) {
      findings.push({
        label: "Tahsilat karsilama orani",
        value: fhi.collectionCoverageRatio.toFixed(2),
        significance: fhi.collectionCoverageRatio < 0.8 ? "HIGH" : fhi.collectionCoverageRatio < 1 ? "MEDIUM" : "LOW",
      });
    }
    if (fhi.monthlyBurnRate > 0) {
      findings.push({
        label: "Aylik gider tabani",
        value: `₺${fhi.monthlyBurnRate.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`,
        significance: "MEDIUM",
      });
    }
  } else if (payment) {
    findings.push({
      label: "Nakit riski",
      value: translateCashRiskLevel(payment.cashRiskLevel),
      significance: cashRiskToSignificance(payment.cashRiskLevel),
    });
    findings.push({
      label: "Tahsilat baskisi",
      value: translateCollectionPressure(payment.collectionPressure),
      significance: collectionPressureToSignificance(payment.collectionPressure),
    });
  }

  if (paymentCtx && paymentCtx.totalOverdue > 0) {
    findings.push({
      label: "Vadesi gecmis alacak",
      value: formatAmount(paymentCtx.totalOverdue),
      significance: "HIGH",
    });
  }

  const summary =
    fhi?.executiveSummary ??
    payment?.executiveSummary ??
    "Finansal saglik degerlendirmesi sinirli veriyle uretildi.";

  return {
    sectionId: "monthly_financial_health",
    title: "Finansal Saglik",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(fhi || payment)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: fhi?.confidence === "LOW"
      ? "Finansal saglik verisi dusuk guvenle uretildi; tahsilat veya gider kaynagi eksik olabilir."
      : null,
  };
}

function buildMonthlyManagementFocusSection(input: BuildExecutiveReportInput): ReportSection {
  const review = input.executiveManagementReview;
  const scorecard = input.executiveScorecard;
  const forecast = input.executiveForecast;

  if (!review && !scorecard && !forecast) {
    return insufficientSection("monthly_management_focus", "Yonetim Odagi");
  }

  const findings: ReportFinding[] = [];

  if (review?.nonNegotiableFocus) {
    findings.push({
      label: "Bekletilmeyecek odak",
      value: review.nonNegotiableFocus,
      significance: "HIGH",
    });
  }

  if (review?.mainManagementConcern) {
    findings.push({
      label: "Ana yonetim kaygisi",
      value: review.mainManagementConcern,
      significance: "HIGH",
    });
  }

  if (review?.reviewType && review.reviewType !== "LOW_RISK_MONITOR_ONLY") {
    findings.push({
      label: "Yonetim degerlendirme tipi",
      value: translateReviewType(review.reviewType),
      significance: review.reviewType === "COMPANY_PERFORMANCE_CRITICAL" || review.reviewType === "DECISION_DISCIPLINE_RISK" ? "HIGH" : "MEDIUM",
    });
  }

  if (scorecard?.weakestArea && !review?.nonNegotiableFocus) {
    findings.push({
      label: "Oncelikli iyilestirme alani",
      value: translateScorecardArea(scorecard.weakestArea),
      significance: "MEDIUM",
    });
  }

  const summary =
    review?.nonNegotiableFocus ??
    review?.mainManagementConcern ??
    (scorecard?.weakestArea ? `Oncelikli odak alani: ${translateScorecardArea(scorecard.weakestArea)}` : null) ??
    "Yonetim odagi sinirli veriyle belirlendi.";

  return {
    sectionId: "monthly_management_focus",
    title: "Yonetim Odagi",
    summary,
    findings,
    confidence: sectionConfidenceFromFindings(findings.length, Boolean(review || scorecard)),
    status: findings.length > 0 ? "GENERATED" : "INSUFFICIENT_DATA",
    dataNote: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// MONTHLY EXECUTIVE helpers
// ──────────────────────────────────────────────────────────────────────────────

function translateCompanyPerformanceLevel(level: string): string {
  const map: Record<string, string> = {
    STRONG: "Guclu",
    STABLE: "Dengeli",
    PRESSURED: "Baski altinda",
    CRITICAL: "Kritik",
  };
  return map[level] ?? level;
}

function translateCompanyPerformanceMomentum(momentum: string): string {
  const map: Record<string, string> = {
    ACCELERATING: "Ivme artiyor",
    STABLE: "Dengeli seyrediyor",
    DECELERATING: "Ivme yavasliyor",
    UNKNOWN: "Belirsiz",
  };
  return map[momentum] ?? momentum;
}

function translateQualitySignal(signal: string): string {
  const map: Record<string, string> = {
    STRONG: "Guclu",
    WATCH: "Izlemede",
    WEAK: "Zayif",
    UNKNOWN: "Belirsiz",
  };
  return map[signal] ?? signal;
}

function translateFinancialHealthLevel(level: string): string {
  const map: Record<string, string> = {
    LOW: "Dusuk",
    MEDIUM: "Orta",
    HIGH: "Yuksek",
    CRITICAL: "Kritik",
  };
  return map[level] ?? level;
}

function translateReviewType(type: string): string {
  const map: Record<string, string> = {
    COMPANY_PERFORMANCE_CRITICAL: "Sirket performansi kritik",
    DECISION_DISCIPLINE_RISK: "Karar disiplini riski",
    TOP_POSITIVE_SIGNAL: "Guclu performans sinyali",
    CLEAR_ACTION_REQUIRED: "Net aksiyon gerekli",
    ACCOUNTABILITY_FOLLOW_UP_REQUIRED: "Sorumluluk takibi gerekli",
    EXECUTION_CONTROL_REQUIRED: "Icra kontrolu gerekli",
    STRATEGIC_DECISION_REQUIRED: "Stratejik karar gerekli",
    OWNER_CLARIFICATION_REQUIRED: "Sahiplik netlestirmesi gerekli",
    WAITING_ON_CUSTOMER: "Musteri beklemesi",
    USER_OVERLOAD_RISK: "Kullanici asiri yuk riski",
    DATA_INSUFFICIENT: "Veri yetersiz",
    LOW_RISK_MONITOR_ONLY: "Dusuk risk, izle",
  };
  return map[type] ?? type;
}

function companyPerformanceLevelToSignificance(level: string): ReportSignificance {
  if (level === "CRITICAL") return "HIGH";
  if (level === "PRESSURED") return "HIGH";
  if (level === "STABLE") return "MEDIUM";
  return "LOW";
}

function qualitySignalToSignificance(signal: string): ReportSignificance {
  if (signal === "WEAK") return "HIGH";
  if (signal === "WATCH") return "MEDIUM";
  return "LOW";
}

function financialHealthLevelToSignificance(level: string): ReportSignificance {
  if (level === "CRITICAL" || level === "LOW") return "HIGH";
  if (level === "MEDIUM") return "MEDIUM";
  return "LOW";
}

// ──────────────────────────────────────────────────────────────────────────────
// GENERIC FALLBACK (WEEKLY, CUSTOM_DATE_RANGE)
// ──────────────────────────────────────────────────────────────────────────────

function buildGenericFallbackReport(input: BuildExecutiveReportInput): ExecutiveReport {
  const title = resolveReportTitle(input.reportType);
  const sections: ReportSection[] = [
    fallbackSection(
      "summary_fallback",
      "Ozet",
      `"${title}" rapor tipi icin yeterli kaynak veri henuz mevcut degil ya da V1 kapsaminda desteklenmiyor.`,
    ),
  ];

  return {
    reportType: input.reportType,
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    title,
    executiveSummary: `"${title}" sinirli guvenle uretildi.`,
    sections,
    overallConfidence: "LOW",
    dataQualityNote: buildDataQualityNote(input.failedSteps ?? [], true, input.reportType),
    isFallback: true,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Translation helpers
// ──────────────────────────────────────────────────────────────────────────────

function translateScorecardLevel(level: string): string {
  const map: Record<string, string> = {
    HEALTHY: "Saglikli",
    WATCH: "Izlemede",
    PRESSURED: "Baski altinda",
    AT_RISK: "Risk altinda",
    UNKNOWN: "Belirsiz",
  };
  return map[level] ?? level;
}

function translateScorecardArea(area: string): string {
  const map: Record<string, string> = {
    CASH_HEALTH: "Nakit sagligi",
    COLLECTION_HEALTH: "Tahsilat sagligi",
    SALES_PIPELINE_HEALTH: "Satis pipeline sagligi",
    EXECUTION_HEALTH: "Icra sagligi",
    DECISION_DISCIPLINE: "Karar disiplini",
    MARKET_EXPOSURE: "Piyasa etkisi",
    SIGNAL_MOMENTUM: "Sinyal momentumu",
    DATA_QUALITY: "Veri kalitesi",
  };
  return map[area] ?? area;
}

function translateForecastRiskLevel(level: string): string {
  const map: Record<string, string> = {
    LOW: "Dusuk",
    WATCH: "Izlemede",
    HIGH: "Yuksek",
    CRITICAL: "Kritik",
  };
  return map[level] ?? level;
}

function translateCouncilPosition(position: string): string {
  const map: Record<string, string> = {
    STABLE: "Stabil",
    WATCHFUL: "Dikkatli",
    PRESSURED: "Baski altinda",
    CRITICAL: "Kritik",
    UNCERTAIN: "Belirsiz",
  };
  return map[position] ?? position;
}

function translateCollectionPressure(pressure: string): string {
  const map: Record<string, string> = { LOW: "Dusuk", MEDIUM: "Orta", HIGH: "Yuksek" };
  return map[pressure] ?? pressure;
}

function translateCashRiskLevel(level: string): string {
  const map: Record<string, string> = { LOW: "Dusuk", MEDIUM: "Orta", HIGH: "Yuksek", CRITICAL: "Kritik" };
  return map[level] ?? level;
}

function translateQuoteRiskLevel(level: string): string {
  const map: Record<string, string> = { LOW: "Dusuk", MEDIUM: "Orta", HIGH: "Yuksek", CRITICAL: "Kritik" };
  return map[level] ?? level;
}

function translateTrendDirection(direction: string): string {
  const map: Record<string, string> = {
    RISING: "Yukseliyor",
    DECLINING: "Gerileme",
    STABLE: "Stabil",
    IMPROVING: "Iyilesiyor",
    UNKNOWN: "Belirsiz",
  };
  return map[direction] ?? direction;
}

function scorecardLevelToSignificance(level: string): ReportSignificance {
  if (level === "AT_RISK") return "HIGH";
  if (level === "PRESSURED" || level === "WATCH") return "MEDIUM";
  return "LOW";
}

function forecastRiskToSignificance(level: string): ReportSignificance {
  if (level === "CRITICAL" || level === "HIGH") return "HIGH";
  if (level === "WATCH") return "MEDIUM";
  return "LOW";
}

function councilPositionToSignificance(position: string): ReportSignificance {
  if (position === "CRITICAL") return "HIGH";
  if (position === "PRESSURED" || position === "WATCHFUL") return "MEDIUM";
  return "LOW";
}

function urgencyToSignificance(urgency: string): ReportSignificance {
  if (urgency === "URGENT") return "HIGH";
  if (urgency === "IMPORTANT" || urgency === "WATCH") return "MEDIUM";
  return "LOW";
}

function collectionPressureToSignificance(pressure: string): ReportSignificance {
  if (pressure === "HIGH") return "HIGH";
  if (pressure === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function cashRiskToSignificance(level: string): ReportSignificance {
  if (level === "CRITICAL" || level === "HIGH") return "HIGH";
  if (level === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function quoteRiskToSignificance(level: string): ReportSignificance {
  if (level === "CRITICAL" || level === "HIGH") return "HIGH";
  if (level === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
