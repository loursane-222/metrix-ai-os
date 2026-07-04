import type {
  BuildExecutiveOperatingRhythmInput,
  ExecutiveOperatingRhythm,
  OperatingHorizon,
  OperatingRhythmConfidence,
  OperatingRhythmHorizonBlock,
  OperatingRhythmItem,
  OperatingRhythmItemSource,
  OperatingRhythmPosture,
} from "./executive-operating-rhythm.types";
import type { AlertCategory } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveScorecardArea } from "@/lib/executive-scorecard";

// ─── Internal types ───────────────────────────────────────────────────────────

type OperatingFocusArea =
  | "CASH"
  | "COLLECTION"
  | "SALES"
  | "MARKET"
  | "FOLLOW_UP"
  | "GOAL"
  | "EXECUTION"
  | "STRATEGY";

type ItemCandidate = Omit<OperatingRhythmItem, "id" | "priority"> & {
  focusArea: OperatingFocusArea;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TODAY      = 3;
const MAX_THIS_WEEK  = 5;
const MAX_THIS_MONTH = 5;

const ALERT_TO_FOCUS: Record<AlertCategory, OperatingFocusArea> = {
  COLLECTION_PRESSURE: "COLLECTION",
  CASH_FLOW_RISK:      "CASH",
  QUOTE_PIPELINE_RISK: "SALES",
  EXECUTION_GAP:       "EXECUTION",
  CURRENCY_EXPOSURE:   "MARKET",
  MARKET_RISK:         "MARKET",
  STRATEGIC_HEALTH:    "STRATEGY",
};

const SCORECARD_AREA_TO_FOCUS: Record<ExecutiveScorecardArea, OperatingFocusArea> = {
  CASH_HEALTH:           "CASH",
  COLLECTION_HEALTH:     "COLLECTION",
  SALES_PIPELINE_HEALTH: "SALES",
  EXECUTION_HEALTH:      "EXECUTION",
  DECISION_DISCIPLINE:   "FOLLOW_UP",
  MARKET_EXPOSURE:       "MARKET",
  SIGNAL_MOMENTUM:       "EXECUTION",
  DATA_QUALITY:          "EXECUTION",
};

const FOCUS_LABELS: Record<OperatingFocusArea, string> = {
  CASH:      "Nakit",
  COLLECTION: "Tahsilat",
  SALES:     "Satış",
  MARKET:    "Piyasa",
  FOLLOW_UP: "Karar takibi",
  GOAL:      "Hedef",
  EXECUTION: "İcra",
  STRATEGY:  "Strateji",
};

const SCORECARD_AREA_LABELS: Record<ExecutiveScorecardArea, string> = {
  CASH_HEALTH:           "Nakit sağlığı",
  COLLECTION_HEALTH:     "Tahsilat",
  SALES_PIPELINE_HEALTH: "Satış pipeline",
  EXECUTION_HEALTH:      "İcra",
  DECISION_DISCIPLINE:   "Karar disiplini",
  MARKET_EXPOSURE:       "Piyasa",
  SIGNAL_MOMENTUM:       "Sinyal trendi",
  DATA_QUALITY:          "Veri kalitesi",
};

const SOURCE_THEMES: Record<OperatingRhythmItemSource, string> = {
  alert:              "URGENT_RISK",
  forecast:           "FORECAST_RISK",
  prioritization:     "PRIORITY_ACTION",
  decision_outcome:   "DECISION_DISCIPLINE",
  customer_portfolio: "CUSTOMER_RISK",
  goal_intelligence:  "GOAL_GAP",
  scorecard:          "STRUCTURAL_WEAKNESS",
  briefing:           "MARKET_PRESSURE",
  company_performance: "PERFORMANCE_PRESSURE",
  quote:              "PIPELINE_RISK",
  payment:            "CASH_COLLECTION",
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export function buildExecutiveOperatingRhythm(
  input: BuildExecutiveOperatingRhythmInput,
): ExecutiveOperatingRhythm {
  const todayItems     = buildTodayItems(input);
  const thisWeekItems  = buildThisWeekItems(input);
  const thisMonthItems = buildThisMonthItems(input);
  const overallPosture = resolvePosture(input);
  const confidence     = resolveConfidence(input);

  return {
    organizationId: input.organizationId,
    generatedAt:    new Date().toISOString(),
    today:     buildBlock("TODAY",      todayItems,     overallPosture),
    thisWeek:  buildBlock("THIS_WEEK",  thisWeekItems,  overallPosture),
    thisMonth: buildBlock("THIS_MONTH", thisMonthItems, overallPosture),
    overallPosture,
    confidence,
  };
}

// ─── TODAY ────────────────────────────────────────────────────────────────────

function buildTodayItems(input: BuildExecutiveOperatingRhythmInput): OperatingRhythmItem[] {
  const candidates: ItemCandidate[] = [];
  const used = new Set<OperatingFocusArea>();

  // 1. Gecikmiş karar takibi
  const overdue = input.executiveDecisionContext?.overdueCommittedDecision;
  if (overdue && !used.has("FOLLOW_UP")) {
    addCandidate(candidates, used, {
      horizon:           "TODAY",
      title:             "Gecikmiş karar takibi",
      description:       `"${overdue.title}" kararının sonucu hâlâ netleşmedi.`,
      source:            "decision_outcome",
      specificTarget:    overdue.title,
      reason:            "Açık karar kapanmadan yeni aksiyona geçmek yönetim yükü yaratır.",
      riskIfIgnored:     "Gecikmiş karar belirsizliği hem ekibi hem müşteriyi olumsuz etkiler.",
      concreteNextStep:  overdue.actionHint ?? "Kararın mevcut durumunu ekiple netleştir.",
      relatedCapability: "executiveDecisionContext",
      confidence:        "HIGH",
      focusArea:         "FOLLOW_UP",
    });
  }

  // 2. Kritik uyarılar
  for (const alert of (input.executiveAlerts?.criticalAlerts ?? [])) {
    if (candidates.length >= MAX_TODAY) break;
    const focusArea = ALERT_TO_FOCUS[alert.category];
    if (used.has(focusArea)) continue;
    addCandidate(candidates, used, {
      horizon:           "TODAY",
      title:             alert.headline,
      description:       alert.actionableStep ?? alert.headline,
      source:            "alert",
      specificTarget:    null,
      reason:            `${FOCUS_LABELS[focusArea]} alanında kritik sistem uyarısı; bugün müdahale gerekiyor.`,
      riskIfIgnored:     `${FOCUS_LABELS[focusArea]} riski bugün yönetilmezse kısa vadede büyüyebilir.`,
      concreteNextStep:  alert.actionableStep,
      relatedCapability: "executiveAlerts",
      confidence:        "HIGH",
      focusArea,
    });
  }

  // 3. Şirket performansı kritik seviyede
  const cps = input.companyPerformanceSignal;
  if (
    candidates.length < MAX_TODAY &&
    cps?.performanceLevel === "CRITICAL" &&
    cps.confidence !== "LOW" &&
    !used.has("EXECUTION")
  ) {
    addCandidate(candidates, used, {
      horizon:           "TODAY",
      title:             "Şirket performansı kritik seviyede",
      description:       cps.primaryRisk ?? cps.executiveSummary,
      source:            "company_performance",
      specificTarget:    null,
      reason:            "Şirket genelinde kritik baskı var; bugün yönetim odağı gerekiyor.",
      riskIfIgnored:     "Operasyonel ve finansal etki bugün yönetilmezse derinleşebilir.",
      concreteNextStep:  cps.primaryRisk
        ? `Öncelikli risk: ${cps.primaryRisk}. Kısa vadeli düzeltme adımını netleştir.`
        : "Şirket geneli kritik riski ekiple değerlendir.",
      relatedCapability: "companyPerformanceSignal",
      confidence:        cps.confidence === "HIGH" ? "HIGH" : "MEDIUM",
      focusArea:         "EXECUTION",
    });
  }

  // 4. Prioritization TODAY hamleleri
  for (const move of (input.executivePriority?.topExecutiveMoves ?? [])) {
    if (candidates.length >= MAX_TODAY) break;
    if (move.urgency !== "TODAY") continue;
    const focusArea = moveLabelToFocusArea(move.area);
    if (used.has(focusArea)) continue;
    addCandidate(candidates, used, {
      horizon:           "TODAY",
      title:             move.action,
      description:       move.concreteNextStep ?? move.action,
      source:            "prioritization",
      specificTarget:    move.specificTarget,
      reason:            input.executivePriority?.topExecutivePriority?.whyNow
                           ?? "Öncelik motorunun belirlediği acil hamle.",
      riskIfIgnored:     move.riskIfIgnored,
      concreteNextStep:  move.concreteNextStep,
      relatedCapability: "executivePriority",
      confidence:        prioritizationConfidence(input),
      focusArea,
    });
  }

  // 5. Bugünkü brifing kritik gelişmesi
  const briefing  = input.latestBriefing;
  const todayDate = new Date().toISOString().slice(0, 10);
  if (
    candidates.length < MAX_TODAY &&
    !used.has("MARKET") &&
    briefing?.briefingDate === todayDate &&
    briefing.kritikItems.length > 0
  ) {
    const item = briefing.kritikItems[0];
    addCandidate(candidates, used, {
      horizon:           "TODAY",
      title:             item.headline,
      description:       item.summary,
      source:            "briefing",
      specificTarget:    null,
      reason:            "Bugün dış gelişme sinyali var; piyasa etkisi yönetim kararını etkileyebilir.",
      riskIfIgnored:     "Dış gelişmeye hazırlıksız kalmak operasyonel risk yaratır.",
      concreteNextStep:  item.yonetim_onerisi || null,
      relatedCapability: "dailyBriefing",
      confidence:        "MEDIUM",
      focusArea:         "MARKET",
    });
  }

  return finalize(candidates, MAX_TODAY, "today");
}

// ─── THIS WEEK ────────────────────────────────────────────────────────────────

function buildThisWeekItems(input: BuildExecutiveOperatingRhythmInput): OperatingRhythmItem[] {
  const candidates: ItemCandidate[] = [];
  const used = new Set<OperatingFocusArea>();

  // 1. Prioritization THIS_WEEK hamleleri
  for (const move of (input.executivePriority?.topExecutiveMoves ?? [])) {
    if (candidates.length >= MAX_THIS_WEEK) break;
    if (move.urgency !== "THIS_WEEK") continue;
    const focusArea = moveLabelToFocusArea(move.area);
    if (used.has(focusArea)) continue;
    addCandidate(candidates, used, {
      horizon:           "THIS_WEEK",
      title:             move.action,
      description:       move.concreteNextStep ?? move.action,
      source:            "prioritization",
      specificTarget:    move.specificTarget,
      reason:            input.executivePriority?.topExecutivePriority?.whyNow
                           ?? "Öncelik motorunun belirlediği bu haftaki hamle.",
      riskIfIgnored:     move.riskIfIgnored,
      concreteNextStep:  move.concreteNextStep,
      relatedCapability: "executivePriority",
      confidence:        prioritizationConfidence(input),
      focusArea,
    });
  }

  // 2. Hedef açığı
  const rate    = input.executiveForecast?.projection.goalAchievementRate ?? null;
  const goalGap = input.executiveForecast?.projection.goalGap ?? null;
  if (candidates.length < MAX_THIS_WEEK && rate !== null && rate < 0.8 && !used.has("GOAL")) {
    const gapStr = goalGap ? ` (açık: ₺${Math.round(goalGap).toLocaleString("tr-TR")})` : "";
    addCandidate(candidates, used, {
      horizon:           "THIS_WEEK",
      title:             "Aylık hedef açığı kapanmıyor",
      description:       `Hedef gerçekleşme oranı %${Math.round(rate * 100)} seviyesinde${gapStr}; bu hafta kapanma aksiyonu gerekiyor.`,
      source:            "goal_intelligence",
      specificTarget:    "Aylık gelir hedefi",
      reason:            "Hedef açığı bu hafta yönetilmezse ay sonu kapanma ihtimali azalır.",
      riskIfIgnored:     goalGap
        ? `₺${Math.round(goalGap).toLocaleString("tr-TR")} hedef açığı bu ay kapanmayabilir.`
        : "Aylık gelir hedefine bu dönem ulaşılamayabilir.",
      concreteNextStep:  "Hedef açığını kapatacak en kısa vadeli gelir kalemini bu hafta netleştir.",
      relatedCapability: "executiveForecast",
      confidence:        "MEDIUM",
      focusArea:         "GOAL",
    });
  }

  // 3. Riskli müşteriler
  const atRisk = input.customerPortfolioIntelligence?.atRiskCustomers ?? [];
  if (candidates.length < MAX_THIS_WEEK && atRisk.length > 0 && !used.has("COLLECTION")) {
    const top = atRisk[0];
    addCandidate(candidates, used, {
      horizon:           "THIS_WEEK",
      title:             `${atRisk.length} riskli müşteri takip bekliyor`,
      description:       top.totalOverdue > 0
        ? `En kritik: ${top.displayName} — ₺${Math.round(top.totalOverdue).toLocaleString("tr-TR")} gecikmiş tahsilat.`
        : `${atRisk.length} müşteride tahsilat ve ilişki riski var.`,
      source:            "customer_portfolio",
      specificTarget:    atRisk.length === 1 ? top.displayName : `${atRisk.length} riskli müşteri`,
      reason:            "Riskli müşteriler takipsiz kalırsa tahsilat kaybı büyüyebilir.",
      riskIfIgnored:     top.totalOverdue > 0
        ? `₺${Math.round(top.totalOverdue).toLocaleString("tr-TR")} gecikmiş tahsilat bu ay kapanmayabilir.`
        : `${atRisk.length} müşteri takipsiz kalırsa ilişki ve tahsilat riski derinleşebilir.`,
      concreteNextStep:  `${top.displayName} için tahsilat ve ilişki durumunu bu hafta netleştir.`,
      relatedCapability: "customerPortfolioIntelligence",
      confidence:        "MEDIUM",
      focusArea:         "COLLECTION",
    });
  }

  // 4. Karar disiplini trendi düşüyor
  const trend = input.executiveDecisionContext?.outcomeAggregate?.trend;
  if (candidates.length < MAX_THIS_WEEK && trend?.direction === "DECLINING" && !used.has("FOLLOW_UP")) {
    addCandidate(candidates, used, {
      horizon:           "THIS_WEEK",
      title:             "Karar takip ritmi zayıflıyor",
      description:       "Karar başarı trendi bu dönemde düşüş gösteriyor; takip disiplini güçlendirilmeli.",
      source:            "decision_outcome",
      specificTarget:    "Karar takip ritmi",
      reason:            "Düşen karar başarı trendi yönetim disiplini sorununa işaret ediyor.",
      riskIfIgnored:     "Karar başarı trendi düşmeye devam edebilir.",
      concreteNextStep:  "Karar takip ritmini güçlendir; başarısız kararların ortak örüntüsünü ekiple incele.",
      relatedCapability: "executiveDecisionContext",
      confidence:        "MEDIUM",
      focusArea:         "FOLLOW_UP",
    });
  }

  // 5. Yüksek uyarılar
  for (const alert of (input.executiveAlerts?.highAlerts ?? [])) {
    if (candidates.length >= MAX_THIS_WEEK) break;
    const focusArea = ALERT_TO_FOCUS[alert.category];
    if (used.has(focusArea)) continue;
    addCandidate(candidates, used, {
      horizon:           "THIS_WEEK",
      title:             alert.headline,
      description:       alert.actionableStep ?? alert.headline,
      source:            "alert",
      specificTarget:    null,
      reason:            `${FOCUS_LABELS[focusArea]} alanında yüksek risk sinyali; bu hafta yönetilmeli.`,
      riskIfIgnored:     `${FOCUS_LABELS[focusArea]} riski bu hafta yönetilmezse yükselebilir.`,
      concreteNextStep:  alert.actionableStep,
      relatedCapability: "executiveAlerts",
      confidence:        "HIGH",
      focusArea,
    });
  }

  // 6. Hareketsiz teklifler
  const qi = input.quoteIntelligence;
  if (
    candidates.length < MAX_THIS_WEEK &&
    qi &&
    (qi.staleQuoteCount > 2 || qi.hotQuoteCount > 0) &&
    !used.has("SALES")
  ) {
    addCandidate(candidates, used, {
      horizon:           "THIS_WEEK",
      title:             qi.staleQuoteCount > 2
        ? `${qi.staleQuoteCount} teklif hareketsiz; dönüşüm riski var`
        : `${qi.hotQuoteCount} sıcak teklif takip bekliyor`,
      description:       qi.quotePipelineSummary,
      source:            "quote",
      specificTarget:    null,
      reason:            "Hareketsiz teklifler kapanmadan pipeline değeri erir.",
      riskIfIgnored:     "Teklif dönüşüm oranı düşmeye devam edebilir.",
      concreteNextStep:  qi.nextBestActions.length > 0
        ? qi.nextBestActions[0]
        : "Hareketsiz teklifleri bu hafta takip et.",
      relatedCapability: "quoteIntelligence",
      confidence:        "MEDIUM",
      focusArea:         "SALES",
    });
  }

  return finalize(candidates, MAX_THIS_WEEK, "week");
}

// ─── THIS MONTH ───────────────────────────────────────────────────────────────

function buildThisMonthItems(input: BuildExecutiveOperatingRhythmInput): OperatingRhythmItem[] {
  const candidates: ItemCandidate[] = [];
  const used = new Set<OperatingFocusArea>();

  const rate    = input.executiveForecast?.projection.goalAchievementRate ?? null;
  const goalGap = input.executiveForecast?.projection.goalGap ?? null;

  // 1. Yapısal hedef açığı (rate < 0.6)
  if (rate !== null && rate < 0.6 && !used.has("GOAL")) {
    addCandidate(candidates, used, {
      horizon:           "THIS_MONTH",
      title:             "Aylık hedefle yapısal açık var",
      description:       `Hedef gerçekleşme tahmini %${Math.round(rate * 100)}; ay sonu kapanması için yalnızca operasyonel aksiyon yeterli olmayabilir.`,
      source:            "forecast",
      specificTarget:    "Aylık gelir hedefi",
      reason:            "Düşük hedef gerçekleşme tahmini operasyonel değil yapısal müdahale gerektiriyor.",
      riskIfIgnored:     goalGap
        ? `₺${Math.round(goalGap).toLocaleString("tr-TR")} hedef açığı bu ay kapanmayabilir.`
        : "Bu dönem gelir hedefine ulaşılamayabilir.",
      concreteNextStep:  "Hedef yapısını ve pipeline'ı bu ay gözden geçir; gerekirse hedef revize et.",
      relatedCapability: "executiveForecast",
      confidence:        "MEDIUM",
      focusArea:         "GOAL",
    });
  }

  // 2. Müşteri konsantrasyon riski
  const concRisk = input.customerPortfolioIntelligence?.concentrationRisk;
  if (
    candidates.length < MAX_THIS_MONTH &&
    (concRisk?.level === "HIGH" || concRisk?.level === "CRITICAL") &&
    !used.has("STRATEGY")
  ) {
    addCandidate(candidates, used, {
      horizon:           "THIS_MONTH",
      title:             "Müşteri konsantrasyon riski yüksek",
      description:       concRisk.topCustomerName
        ? `En büyük müşteri (${concRisk.topCustomerName}) portföyün %${Math.round(concRisk.topCustomerShare * 100)}'ini oluşturuyor.`
        : "Müşteri portföyü aşırı konsantre; bağımlılık riski var.",
      source:            "customer_portfolio",
      specificTarget:    concRisk.topCustomerName,
      reason:            "Yüksek müşteri konsantrasyonu portföy kırılganlığını artırır.",
      riskIfIgnored:     "Tek müşteri kaybı gelir tabanını ciddi etkileyebilir.",
      concreteNextStep:  "Bu ay müşteri çeşitlendirme stratejisini gündemine al.",
      relatedCapability: "customerPortfolioIntelligence",
      confidence:        "MEDIUM",
      focusArea:         "STRATEGY",
    });
  }

  // 3. Karar disiplini yapısal sorun (düşük başarı oranı + gerileyen trend)
  const aggregate = input.executiveDecisionContext?.outcomeAggregate;
  if (
    candidates.length < MAX_THIS_MONTH &&
    aggregate?.trend?.direction === "DECLINING" &&
    (aggregate.successRate ?? 1) < 0.6 &&
    !used.has("FOLLOW_UP")
  ) {
    const successPct = Math.round((aggregate.successRate ?? 0) * 100);
    addCandidate(candidates, used, {
      horizon:           "THIS_MONTH",
      title:             "Karar disiplininde yapısal zayıflık",
      description:       `Son 30 günde karar başarı oranı %${successPct}; süreç tasarımı gözden geçirilmeli.`,
      source:            "decision_outcome",
      specificTarget:    "Karar disiplini süreci",
      reason:            "Düşük ve gerileyen karar başarı oranı yönetim sürecinin yapısal sorununa işaret ediyor.",
      riskIfIgnored:     "Karar kalitesi düşmeye devam ederse yönetim etkinliği uzun vadede zarar görür.",
      concreteNextStep:  "Karar süreci tasarımını ve takip mekanizmasını bu ay gözden geçir.",
      relatedCapability: "executiveDecisionContext",
      confidence:        aggregate.confidence === "HIGH" ? "HIGH" : "MEDIUM",
      focusArea:         "FOLLOW_UP",
    });
  }

  // 4. Scorecard zayıf alan yapısal müdahale
  const weakestArea  = input.executiveScorecard?.weakestArea;
  const scorecardLvl = input.executiveScorecard?.overallLevel;
  if (
    candidates.length < MAX_THIS_MONTH &&
    weakestArea &&
    (scorecardLvl === "AT_RISK" || scorecardLvl === "PRESSURED")
  ) {
    const focusArea  = SCORECARD_AREA_TO_FOCUS[weakestArea];
    if (!used.has(focusArea)) {
      const areaResult = input.executiveScorecard?.areas.find((a) => a.area === weakestArea);
      const areaLabel  = SCORECARD_AREA_LABELS[weakestArea];
      addCandidate(candidates, used, {
        horizon:           "THIS_MONTH",
        title:             `${areaLabel} alanında yapısal iyileştirme gerekiyor`,
        description:       areaResult?.headline ?? `${areaLabel} alanı scorecard'ın en zayıf bölgesi.`,
        source:            "scorecard",
        specificTarget:    areaLabel,
        reason:            "Süregelen zayıflık yapısal müdahale olmadan operasyonel baskıya dönüşür.",
        riskIfIgnored:     `${areaLabel} alanı bu ay ele alınmazsa yönetim yükü artabilir.`,
        concreteNextStep:  areaResult?.recommendedAttention
          ?? `${areaLabel} için kök neden analizi ve iyileştirme planı oluştur.`,
        relatedCapability: "executiveScorecard",
        confidence:        "MEDIUM",
        focusArea,
      });
    }
  }

  // 5. Kritik stratejik hedef eksikliği
  const goalIntel = input.goalIntelligence;
  if (
    candidates.length < MAX_THIS_MONTH &&
    goalIntel &&
    goalIntel.criticalMissing.length > 0 &&
    !used.has("STRATEGY")
  ) {
    addCandidate(candidates, used, {
      horizon:           "THIS_MONTH",
      title:             "Kritik stratejik hedefler tanımlanmamış",
      description:       `${goalIntel.criticalMissing.length} kritik hedef kategorisi eksik; bu durum odak ve yönlendirme kalitesini düşürüyor.`,
      source:            "goal_intelligence",
      specificTarget:    null,
      reason:            "Tanımlanmamış stratejik hedefler yönetim odağının kaymasına neden olur.",
      riskIfIgnored:     "Hedefsiz yönetim kısa vadeli baskılara reaktif kalır.",
      concreteNextStep:  "Eksik kritik hedefleri bu ay sistemde tanımla ve önceliklendir.",
      relatedCapability: "goalIntelligence",
      confidence:        "MEDIUM",
      focusArea:         "STRATEGY",
    });
  }

  // 6. Şirket performans ivmesi yavaşlıyor
  const cps = input.companyPerformanceSignal;
  if (
    candidates.length < MAX_THIS_MONTH &&
    cps?.momentum === "DECELERATING" &&
    cps.confidence !== "LOW" &&
    !used.has("EXECUTION")
  ) {
    addCandidate(candidates, used, {
      horizon:           "THIS_MONTH",
      title:             "Şirket performans ivmesi yavaşlıyor",
      description:       cps.executiveSummary,
      source:            "company_performance",
      specificTarget:    null,
      reason:            "İvme kaybı bu ay ele alınmazsa yapısal performans sorununa dönüşebilir.",
      riskIfIgnored:     "Yavaşlayan ivme uzun vadede rekabet gücünü zayıflatır.",
      concreteNextStep:  cps.primaryRisk
        ? `İvme kaybının temel nedeni: ${cps.primaryRisk}. Bu ay kök nedeni ele al.`
        : "Performans ivmesi düşüşünün yapısal nedenlerini bu ay incele.",
      relatedCapability: "companyPerformanceSignal",
      confidence:        cps.confidence === "HIGH" ? "HIGH" : "MEDIUM",
      focusArea:         "EXECUTION",
    });
  }

  // 7. Forecast GOAL_GAP sinyali (rate >= 0.6 ama GOAL_GAP yüksek risk)
  if (candidates.length < MAX_THIS_MONTH && !used.has("GOAL")) {
    const goalGapSignal = input.executiveForecast?.signals.find(
      (s) => s.riskType === "GOAL_GAP" && (s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH"),
    );
    if (goalGapSignal) {
      addCandidate(candidates, used, {
        horizon:           "THIS_MONTH",
        title:             goalGapSignal.headline,
        description:       goalGapSignal.explanation,
        source:            "forecast",
        specificTarget:    null,
        reason:            "Tahmin motoru bu ay hedef açığı riski tespit etti.",
        riskIfIgnored:     "Hedef açığı büyüyebilir; ay sonu gerçekleşme beklenenin altında kalabilir.",
        concreteNextStep:  goalGapSignal.actionableStep,
        relatedCapability: "executiveForecast",
        confidence:        "MEDIUM",
        focusArea:         "GOAL",
      });
    }
  }

  return finalize(candidates, MAX_THIS_MONTH, "month");
}

// ─── Horizon block ────────────────────────────────────────────────────────────

function buildBlock(
  horizon: OperatingHorizon,
  items: OperatingRhythmItem[],
  posture: OperatingRhythmPosture,
): OperatingRhythmHorizonBlock {
  return {
    headline:  buildHeadline(horizon, items, posture),
    objective: buildObjective(horizon, items),
    theme:     buildTheme(items),
    items,
  };
}

function buildHeadline(
  horizon: OperatingHorizon,
  items: OperatingRhythmItem[],
  posture: OperatingRhythmPosture,
): string {
  if (items.length === 0) {
    const empty: Record<OperatingHorizon, string> = {
      TODAY:      "Bugün kritik müdahale gerektiren sinyal yok.",
      THIS_WEEK:  "Bu hafta öne çıkan yönetim riski yok.",
      THIS_MONTH: "Bu ay yapısal müdahale gerektiren alan tespit edilmedi.",
    };
    return empty[horizon];
  }

  const count = items.length;

  if (horizon === "TODAY") {
    if (posture === "CRITICAL") return `Bugün acil müdahale gerekiyor: ${items[0].title}`;
    if (posture === "PRESSURED") return `Bugün ${count} yönetim konusu odak gerektiriyor.`;
    return `Bugünkü odak: ${items[0].title}`;
  }

  if (horizon === "THIS_WEEK") {
    if (posture === "CRITICAL") return `Bu hafta ${count} kritik konu yönetim gündeminde.`;
    if (posture === "PRESSURED") return `Bu hafta ${count} konu aksiyon gerektiriyor.`;
    return `Bu hafta ${count} konuya odaklan.`;
  }

  if (posture === "CRITICAL" || posture === "PRESSURED") {
    return `Bu ay ${count} yapısal konuda müdahale gerekiyor.`;
  }
  return `Bu ay ${count} stratejik konuya dikkat gerekiyor.`;
}

function buildObjective(horizon: OperatingHorizon, items: OperatingRhythmItem[]): string {
  if (items.length === 0) {
    const empty: Record<OperatingHorizon, string> = {
      TODAY:      "İzleme modu — yeni sinyal gelirse değerlendir.",
      THIS_WEEK:  "Mevcut operasyonu sürdür.",
      THIS_MONTH: "Stratejik konumlamayı gözden geçir.",
    };
    return empty[horizon];
  }
  return items[0].concreteNextStep ?? items[0].title;
}

function buildTheme(items: OperatingRhythmItem[]): string {
  if (items.length === 0) return "NO_ACTION_NEEDED";
  return SOURCE_THEMES[items[0].source] ?? "GENERAL_FOCUS";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addCandidate(
  candidates: ItemCandidate[],
  used: Set<OperatingFocusArea>,
  candidate: ItemCandidate,
): void {
  candidates.push(candidate);
  used.add(candidate.focusArea);
}

function finalize(
  candidates: ItemCandidate[],
  max: number,
  prefix: string,
): OperatingRhythmItem[] {
  return candidates.slice(0, max).map((c, i) => {
    const { focusArea: _focusArea, ...rest } = c;
    return {
      ...rest,
      id:       `${prefix}-${i + 1}`,
      priority: (i + 1) as 1 | 2 | 3 | 4 | 5,
    };
  });
}

function resolvePosture(input: BuildExecutiveOperatingRhythmInput): OperatingRhythmPosture {
  const hasCriticalAlerts  = (input.executiveAlerts?.criticalAlerts.length ?? 0) > 0;
  const isCriticalCps      = input.companyPerformanceSignal?.performanceLevel === "CRITICAL";
  const isScorecardAtRisk  = input.executiveScorecard?.overallLevel === "AT_RISK";

  if (hasCriticalAlerts || isCriticalCps || isScorecardAtRisk) return "CRITICAL";

  const hasHighAlerts         = (input.executiveAlerts?.highAlerts.length ?? 0) > 0;
  const isPressuredCps        = input.companyPerformanceSignal?.performanceLevel === "PRESSURED";
  const isScorecardPressured  = input.executiveScorecard?.overallLevel === "PRESSURED";
  const isGoalBehind          = (input.executiveForecast?.projection.goalAchievementRate ?? 1) < 0.7;
  const hasOverdueDecision    =
    input.executiveDecisionContext?.overdueCommittedDecision != null;

  if (hasHighAlerts || isPressuredCps || isScorecardPressured || isGoalBehind || hasOverdueDecision) {
    return "PRESSURED";
  }

  return "STABLE";
}

function resolveConfidence(input: BuildExecutiveOperatingRhythmInput): OperatingRhythmConfidence {
  const sc = input.executiveScorecard?.confidence ?? null;
  const fc = input.executiveForecast?.overallConfidence ?? null;

  if (!input.executiveScorecard && !input.executiveForecast) return "LOW";
  if (sc === "LOW" || fc === "LOW") return "LOW";
  if (sc === "HIGH" && fc === "HIGH") return "HIGH";
  return "MEDIUM";
}

function prioritizationConfidence(input: BuildExecutiveOperatingRhythmInput): OperatingRhythmConfidence {
  const c = input.executivePriority?.confidence;
  if (c === "HIGH") return "HIGH";
  if (c === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function moveLabelToFocusArea(area: string): OperatingFocusArea {
  const l = area.toLowerCase();
  if (l.includes("nakit"))                                               return "CASH";
  if (l.includes("tahsilat") || l.includes("müşteri"))                   return "COLLECTION";
  if (l.includes("satış") || l.includes("teklif") || l.includes("pipeline")) return "SALES";
  if (l.includes("piyasa") || l.includes("kur") || l.includes("döviz")) return "MARKET";
  if (l.includes("karar") || l.includes("disiplin") || l.includes("takip")) return "FOLLOW_UP";
  if (l.includes("hedef"))                                               return "GOAL";
  if (l.includes("strateji"))                                            return "STRATEGY";
  return "EXECUTION";
}
