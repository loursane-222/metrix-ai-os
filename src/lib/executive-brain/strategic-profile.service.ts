import type {
  CustomerStrategy,
  ExecutiveBrainContext,
  ExecutiveBrainSignal,
  FinancialStrategy,
  GrowthStrategy,
  ManagementStyle,
  OperationalStrategy,
  PeopleStrategy,
  RiskTolerance,
  StrategicConfidence,
  StrategicProfile,
  StrategicProfileEvidence,
} from "./executive-brain.types";

type StrategyRule<TValue extends string> = {
  value: TValue;
  terms: string[];
};

type StrategyDecision<TValue extends string> = {
  value: TValue;
  evidence: StrategicProfileEvidence[];
};

const GROWTH_STRATEGY_RULES: Array<StrategyRule<Exclude<GrowthStrategy, "UNKNOWN">>> = [
  {
    value: "aggressive_growth",
    terms: ["aggressive growth", "rapid growth", "hizli buyume", "agresif buyume"],
  },
  {
    value: "controlled_growth",
    terms: ["controlled growth", "kontrollu buyume", "dengeli buyume"],
  },
  {
    value: "profitability_first_growth",
    terms: ["profitability first", "kar odakli buyume", "karlilik odakli"],
  },
  {
    value: "customer_depth_growth",
    terms: ["upsell", "cross-sell", "existing customer", "mevcut musteri", "musteri derinligi"],
  },
  {
    value: "operational_capacity_first",
    terms: ["capacity first", "kapasite", "operasyon kapasitesi", "teslimat kapasitesi"],
  },
];

const RISK_TOLERANCE_RULES: Array<StrategyRule<Exclude<RiskTolerance, "UNKNOWN">>> = [
  {
    value: "low",
    terms: ["low risk", "risk azalt", "temkinli", "garanti", "nakit koruma"],
  },
  {
    value: "medium",
    terms: ["medium risk", "dengeli risk", "kontrollu risk", "kosullu"],
  },
  {
    value: "high",
    terms: ["high risk", "risk al", "atak", "hizli hareket", "yatirim yap"],
  },
  {
    value: "contextual",
    terms: ["duruma gore", "musteriye gore", "kosula gore", "contextual"],
  },
];

const MANAGEMENT_STYLE_RULES: Array<StrategyRule<Exclude<ManagementStyle, "UNKNOWN">>> = [
  {
    value: "hands_on",
    terms: ["ben ilgilenirim", "kendim takip", "hands on", "yakindan takip"],
  },
  {
    value: "delegating",
    terms: ["ekibe devret", "yetki ver", "delegate", "sorumlu ata"],
  },
  {
    value: "relationship_driven",
    terms: ["iliskiyi koru", "musteri iliskisi", "guveni koru", "relationship"],
  },
  {
    value: "data_driven",
    terms: ["veriye gore", "rapor", "kpi", "data", "olcum"],
  },
  {
    value: "urgency_driven",
    terms: ["bugun", "hemen", "acil", "hizli", "simdi"],
  },
  {
    value: "balanced",
    terms: ["dengeli", "denge", "balanced", "kontrollu"],
  },
];

const CUSTOMER_STRATEGY_RULES: Array<StrategyRule<Exclude<CustomerStrategy, "UNKNOWN">>> = [
  {
    value: "strategic_account_focus",
    terms: ["stratejik musteri", "key account", "kritik musteri"],
  },
  {
    value: "broad_customer_acquisition",
    terms: ["yeni musteri", "musteri kazanimi", "lead", "acquisition"],
  },
  {
    value: "retention_first",
    terms: ["elde tut", "kaybetmek istemiyorum", "retention", "iliskiyi koru"],
  },
  {
    value: "premium_customer_focus",
    terms: ["premium", "ust segment", "kaliteli musteri", "premium musteri"],
  },
  {
    value: "cash_safe_customer_management",
    terms: ["odeme plani", "acik bakiye", "tahsilat", "risk limiti"],
  },
];

const PEOPLE_STRATEGY_RULES: Array<StrategyRule<Exclude<PeopleStrategy, "UNKNOWN">>> = [
  {
    value: "lean_team",
    terms: ["yalin ekip", "az kisi", "lean team", "kucuk ekip"],
  },
  {
    value: "growth_team",
    terms: ["ise alim", "ekibi buyut", "ekibe", "hiring", "team growth"],
  },
  {
    value: "training_first",
    terms: ["egitim", "gelisim", "mentorluk", "training"],
  },
  {
    value: "performance_first",
    terms: ["performans", "hedef", "uyari", "performance"],
  },
  {
    value: "culture_first",
    terms: ["kultur", "motivasyon", "aidiyet", "culture"],
  },
  {
    value: "role_fit_first",
    terms: ["rol uyumu", "dogru rol", "gorev uyumu", "role fit"],
  },
];

const FINANCIAL_STRATEGY_RULES: Array<StrategyRule<Exclude<FinancialStrategy, "UNKNOWN">>> = [
  {
    value: "cash_preservation",
    terms: ["nakit koruma", "nakit akisi", "cash preservation", "nakit sikisikligi"],
  },
  {
    value: "profitability_first",
    terms: ["karlilik", "marj", "profitability", "kar"],
  },
  {
    value: "growth_investment",
    terms: ["yatirim", "buyume yatirimi", "investment", "kanal dene"],
  },
  {
    value: "debt_cautious",
    terms: ["borc", "borclanma", "finansman", "debt"],
  },
  {
    value: "collection_discipline",
    terms: ["tahsilat", "odeme sozu", "acik bakiye", "vade"],
  },
  {
    value: "balanced_finance",
    terms: ["dengeli finans", "nakit ve buyume", "balanced finance"],
  },
];

const OPERATIONAL_STRATEGY_RULES: Array<StrategyRule<Exclude<OperationalStrategy, "UNKNOWN">>> = [
  {
    value: "delivery_quality_first",
    terms: ["teslimat kalitesi", "kalite", "quality", "guvenilir teslimat"],
  },
  {
    value: "speed_first",
    terms: ["hizli teslim", "hiz", "speed", "hemen teslim"],
  },
  {
    value: "process_discipline",
    terms: ["surec", "standart", "process", "disiplin"],
  },
  {
    value: "capacity_growth",
    terms: ["kapasite artir", "kapasite buyut", "capacity growth"],
  },
  {
    value: "bottleneck_reduction",
    terms: ["darbogaz", "bottleneck", "tıkaniklik", "aksama"],
  },
  {
    value: "flexible_operations",
    terms: ["esnek operasyon", "flexible", "duruma gore operasyon"],
  },
];

const REQUIRED_STRATEGIC_SIGNALS = [
  "strategic_focus",
  "top_goal",
  "cashflow_priority",
  "profitability_focus",
  "primary_customer_type",
  "team_size",
  "delivery_risk",
  "risk_preference",
  "management_preference",
];

export function buildStrategicProfile(
  context: ExecutiveBrainContext = {},
): StrategicProfile {
  const evidence = buildEvidence(context);
  const growthStrategy = decideStrategy<GrowthStrategy>(
    "UNKNOWN",
    GROWTH_STRATEGY_RULES,
    evidence,
  );
  const riskTolerance = decideStrategy<RiskTolerance>(
    "UNKNOWN",
    RISK_TOLERANCE_RULES,
    evidence,
  );
  const managementStyle = decideStrategy<ManagementStyle>(
    "UNKNOWN",
    MANAGEMENT_STYLE_RULES,
    evidence,
  );
  const customerStrategy = decideStrategy<CustomerStrategy>(
    "UNKNOWN",
    CUSTOMER_STRATEGY_RULES,
    evidence,
  );
  const peopleStrategy = decideStrategy<PeopleStrategy>(
    "UNKNOWN",
    PEOPLE_STRATEGY_RULES,
    evidence,
  );
  const financialStrategy = decideStrategy<FinancialStrategy>(
    "UNKNOWN",
    FINANCIAL_STRATEGY_RULES,
    evidence,
  );
  const operationalStrategy = decideStrategy<OperationalStrategy>(
    "UNKNOWN",
    OPERATIONAL_STRATEGY_RULES,
    evidence,
  );
  const usedEvidence = uniqueEvidence([
    ...growthStrategy.evidence,
    ...riskTolerance.evidence,
    ...managementStyle.evidence,
    ...customerStrategy.evidence,
    ...peopleStrategy.evidence,
    ...financialStrategy.evidence,
    ...operationalStrategy.evidence,
  ]);
  const missingSignals = REQUIRED_STRATEGIC_SIGNALS.filter(
    (signalKey) => !hasSignal(evidence, signalKey),
  );

  return {
    growthStrategy: growthStrategy.value,
    riskTolerance: riskTolerance.value,
    managementStyle: managementStyle.value,
    customerStrategy: customerStrategy.value,
    peopleStrategy: peopleStrategy.value,
    financialStrategy: financialStrategy.value,
    operationalStrategy: operationalStrategy.value,
    confidence: calculateConfidence(usedEvidence.length, missingSignals.length),
    evidence: usedEvidence,
    missingSignals,
    summary: buildSummary(usedEvidence.length, missingSignals.length),
  };
}

function decideStrategy<TValue extends string>(
  fallback: TValue,
  rules: Array<StrategyRule<Exclude<TValue, "UNKNOWN">>>,
  evidence: StrategicProfileEvidence[],
): StrategyDecision<TValue> {
  let bestRule: StrategyRule<Exclude<TValue, "UNKNOWN">> | null = null;
  let bestEvidence: StrategicProfileEvidence[] = [];

  for (const rule of rules) {
    const matchedEvidence = evidence.filter((item) => matchesAnyTerm(item, rule.terms));

    if (matchedEvidence.length > bestEvidence.length) {
      bestRule = rule;
      bestEvidence = matchedEvidence;
    }
  }

  return {
    value: (bestRule?.value ?? fallback) as TValue,
    evidence: bestEvidence,
  };
}

function buildEvidence(context: ExecutiveBrainContext): StrategicProfileEvidence[] {
  return [
    ...mapSignals("owner", context.ownerSignals),
    ...mapSignals("company", context.companySignals),
    ...mapSignals("customer", context.customerSignals),
    ...mapSignals("personnel", context.personnelSignals),
    ...mapSignals("sales", context.salesSignals),
    ...mapSignals("finance", context.financeSignals),
    ...mapSignals("operations", context.operationsSignals),
    ...mapSignals("memory", context.memorySignals),
  ];
}

function mapSignals(
  source: string,
  signals: ExecutiveBrainSignal[] | undefined,
): StrategicProfileEvidence[] {
  return (signals ?? [])
    .map((signal, index) => ({
      id: signal.evidenceRef ?? signal.id ?? `${source}:${index}:${signal.key ?? "signal"}`,
      key: signal.key ?? signal.category ?? "signal",
      value: signal.value ?? signal.text ?? "",
      source: signal.source ?? source,
      confidence: normalizeConfidence(signal.confidence),
    }))
    .filter((item) => item.key.trim().length > 0 || item.value.trim().length > 0);
}

function matchesAnyTerm(item: StrategicProfileEvidence, terms: string[]): boolean {
  const text = normalizeText(`${item.key} ${item.value} ${item.source}`);

  return terms.some((term) => text.includes(normalizeText(term)));
}

function hasSignal(evidence: StrategicProfileEvidence[], signalKey: string): boolean {
  const normalizedSignalKey = normalizeText(signalKey);

  return evidence.some((item) => {
    const key = normalizeText(item.key);
    const value = normalizeText(item.value);

    return (
      key === normalizedSignalKey ||
      value.includes(normalizedSignalKey.replaceAll("_", " "))
    );
  });
}

function calculateConfidence(
  evidenceCount: number,
  missingSignalCount: number,
): StrategicConfidence {
  if (evidenceCount === 0) {
    return {
      level: "LOW",
      score: 0.1,
      reason: "Strategic profile has no matched strategic evidence yet.",
    };
  }

  const score = roundToTwoDecimals(
    Math.min(0.95, Math.max(0.15, evidenceCount * 0.12 - missingSignalCount * 0.03)),
  );

  if (score >= 0.7) {
    return {
      level: "HIGH",
      score,
      reason: "Multiple strategic evidence items support the profile.",
    };
  }

  if (score >= 0.4) {
    return {
      level: "MEDIUM",
      score,
      reason: "Some repeated strategic evidence exists, but gaps remain.",
    };
  }

  return {
    level: "LOW",
    score,
    reason: "Strategic evidence is still thin or incomplete.",
  };
}

function buildSummary(evidenceCount: number, missingSignalCount: number): string {
  if (evidenceCount === 0) {
    return "Strategic profile is unknown because no strategic evidence is available yet.";
  }

  if (missingSignalCount > 4) {
    return "Strategic profile is forming, but several core strategy signals are still missing.";
  }

  return "Strategic profile has enough early evidence to guide executive assessment cautiously.";
}

function uniqueEvidence(
  evidence: StrategicProfileEvidence[],
): StrategicProfileEvidence[] {
  const seen = new Set<string>();

  return evidence.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function normalizeConfidence(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }

  return roundToTwoDecimals(Math.min(1, Math.max(0, value)));
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
