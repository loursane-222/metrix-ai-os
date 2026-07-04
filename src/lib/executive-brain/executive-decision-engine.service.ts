import type {
  ExecutiveAssessment,
  ExecutiveBrainContext,
  ExecutiveBrainImpact,
  ExecutiveBrainSeverity,
  ExecutiveCouncil,
  ExecutiveCouncilPriority,
  ExecutiveCouncilRecommendation,
  ExecutiveCouncilRisk,
  ExecutiveDecision,
  ExecutiveDecisionCategory,
  ExecutiveDecisionPackage,
  ExecutiveDecisionPriority,
  StrategicProfile,
} from "./executive-brain.types";

type DecisionCandidate = {
  id: string;
  title: string;
  category: ExecutiveDecisionCategory;
  priority: ExecutiveDecisionPriority;
  rationale: string;
  expectedImpact: string;
  recommendedActions: string[];
  risks: string[];
  followUpWindow: string;
  evidenceRefs: string[];
  confidence: number;
  sourceRank: number;
};

export function buildExecutiveDecisionPackage(
  context: ExecutiveBrainContext,
  assessment: ExecutiveAssessment,
  council: ExecutiveCouncil,
  strategicProfile: StrategicProfile,
): ExecutiveDecisionPackage {
  const candidates = buildDecisionCandidates({
    context,
    assessment,
    council,
    strategicProfile,
  }).sort(compareDecisionCandidates);
  const primaryDecision =
    candidates[0] ?? buildFallbackDecision(assessment, council, strategicProfile);
  const supportingDecisions = candidates
    .filter((candidate) => candidate.id !== primaryDecision.id)
    .slice(0, 3)
    .map(toExecutiveDecision);
  const primary = toExecutiveDecision(primaryDecision);

  return {
    primaryDecision: primary,
    supportingDecisions,
    executiveSummary: buildExecutiveSummary(primary, supportingDecisions),
    confidence: calculatePackageConfidence(primary, supportingDecisions),
  };
}

function buildDecisionCandidates(input: {
  context: ExecutiveBrainContext;
  assessment: ExecutiveAssessment;
  council: ExecutiveCouncil;
  strategicProfile: StrategicProfile;
}): DecisionCandidate[] {
  return [
    ...buildDomainSignalDecisions(input.context, input.strategicProfile),
    ...input.council.risks.map((risk) =>
      buildRiskDecision(risk, input.strategicProfile),
    ),
    ...input.council.priorities.map((priority) =>
      buildPriorityDecision(priority, input.strategicProfile),
    ),
    ...input.council.recommendations.map((recommendation) =>
      buildRecommendationDecision(recommendation, input.strategicProfile),
    ),
    ...buildStrategicGapDecisions(input.assessment, input.strategicProfile),
  ];
}

function buildRiskDecision(
  risk: ExecutiveCouncilRisk,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  const category = inferCategory(risk.title, risk.explanation);
  const priority = adjustPriorityForStrategy(
    priorityFromSeverity(risk.severity),
    category,
    strategicProfile,
  );

  return {
    id: `decision-risk-${risk.id}`,
    title: `Resolve ${risk.title}`,
    category,
    priority,
    rationale: buildRationale(risk.explanation, strategicProfile),
    expectedImpact: buildExpectedImpact(category, priority, strategicProfile),
    confidence: calculateDecisionConfidence(
      risk.evidenceRefs.length,
      strategicProfile.confidence.score,
      risk.severity,
    ),
    recommendedActions: buildRecommendedActions({
      category,
      suggestedAction: risk.suggestedAction,
      strategicProfile,
    }),
    risks: buildDecisionRisks(category, strategicProfile),
    followUpWindow: followUpWindowForPriority(priority),
    evidenceRefs: risk.evidenceRefs,
    sourceRank: 0,
  };
}

function buildPriorityDecision(
  priority: ExecutiveCouncilPriority,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  const category = inferCategory(priority.title, priority.explanation);
  const decisionPriority = adjustPriorityForStrategy(
    priorityFromImpact(priority.impact),
    category,
    strategicProfile,
  );

  return {
    id: `decision-priority-${priority.id}`,
    title: priority.title,
    category,
    priority: decisionPriority,
    rationale: buildRationale(priority.explanation, strategicProfile),
    expectedImpact: buildExpectedImpact(category, decisionPriority, strategicProfile),
    confidence: calculateDecisionConfidence(
      priority.evidenceRefs.length,
      strategicProfile.confidence.score,
      priority.impact,
    ),
    recommendedActions: buildRecommendedActions({
      category,
      suggestedAction: priority.suggestedAction,
      strategicProfile,
    }),
    risks: buildDecisionRisks(category, strategicProfile),
    followUpWindow: followUpWindowForPriority(decisionPriority),
    evidenceRefs: priority.evidenceRefs,
    sourceRank: isContextGapText(priority.title, priority.explanation) ? 8 : 1,
  };
}

function buildRecommendationDecision(
  recommendation: ExecutiveCouncilRecommendation,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  const category = inferCategory(recommendation.title, recommendation.explanation);
  const priority = adjustPriorityForStrategy(
    priorityFromImpact(recommendation.impact),
    category,
    strategicProfile,
  );

  return {
    id: `decision-recommendation-${recommendation.id}`,
    title: recommendation.title,
    category,
    priority,
    rationale: buildRationale(recommendation.explanation, strategicProfile),
    expectedImpact: buildExpectedImpact(category, priority, strategicProfile),
    confidence: calculateDecisionConfidence(
      recommendation.evidenceRefs.length,
      strategicProfile.confidence.score,
      recommendation.impact,
    ),
    recommendedActions: buildRecommendedActions({
      category,
      suggestedAction: recommendation.suggestedAction,
      strategicProfile,
    }),
    risks: buildDecisionRisks(category, strategicProfile),
    followUpWindow: followUpWindowForPriority(priority),
    evidenceRefs: recommendation.evidenceRefs,
    sourceRank: isContextGapText(recommendation.title, recommendation.explanation)
      ? 9
      : 2,
  };
}

function buildDomainSignalDecisions(
  context: ExecutiveBrainContext,
  strategicProfile: StrategicProfile,
): DecisionCandidate[] {
  const decisions: DecisionCandidate[] = [];
  const financeText = signalText(context.financeSignals);
  const salesText = signalText(context.salesSignals);
  const customerText = signalText(context.customerSignals);
  const personnelText = signalText(context.personnelSignals);
  const operationsText = signalText(context.operationsSignals);
  const companyText = signalText(context.companySignals);
  const memoryText = signalText(context.memorySignals);

  if (
    hasAny(financeText, [
      "open_balance",
      "payment_delay",
      "cashflow",
      "collection",
      "tahsilat",
      "odeme",
      "gecikti",
      "acik bakiye",
      "nakit",
    ])
  ) {
    decisions.push({
      id: "decision-domain-finance-exposure",
      title: "Tahsilat netlesmeden yeni finansal risk alma",
      category: "FINANCE",
      priority: adjustPriorityForStrategy("HIGH", "FINANCE", strategicProfile),
      rationale:
        "Finance signals show payment or cash exposure. The executive decision should protect cash first, then decide whether new commercial exposure is acceptable.",
      expectedImpact:
        "Reduces collection risk and prevents a customer relationship from turning into uncontrolled cash exposure.",
      confidence: signalConfidence({
        primarySignals: context.financeSignals,
        supportingSignals: [
          ...(context.customerSignals ?? []),
          ...(context.salesSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.72,
      }),
      recommendedActions: [
        "Get a written payment date and amount before accepting new exposure.",
        "Tie new work, delivery, or credit terms to a confirmed payment plan.",
        "Review customer relationship value and cash pressure together before escalating tone.",
      ],
      risks: buildDecisionRisks("FINANCE", strategicProfile),
      followUpWindow: "within 48 hours",
      evidenceRefs: evidenceRefsFromContext(context, [
        "finance",
        "customer",
        "sales",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(`${salesText} ${companyText} ${memoryText}`, [
      "pipeline",
      "lead",
      "quote",
      "yeni musteri",
      "growth",
      "buyume",
      "strategic_focus",
      "top_goal",
    ])
  ) {
    decisions.push({
      id: "decision-domain-qualified-growth",
      title: "Marj ve kapasite filtresiyle buyume kararini ver",
      category: "SALES",
      priority: adjustPriorityForStrategy("HIGH", "SALES", strategicProfile),
      rationale:
        "Growth signals are visible, but executive growth should be qualified by margin, customer quality, and delivery capacity.",
      expectedImpact:
        "Turns demand into healthier growth instead of volume that can damage margin or delivery reliability.",
      confidence: signalConfidence({
        primarySignals: [...(context.salesSignals ?? []), ...(context.companySignals ?? [])],
        supportingSignals: [
          ...(context.financeSignals ?? []),
          ...(context.operationsSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.68,
      }),
      recommendedActions: [
        "Separate qualified demand from low-margin or weak-fit demand.",
        "Set margin and delivery-capacity filters before taking more work.",
        "Prioritize customers that fit the current growth and profitability posture.",
      ],
      risks: buildDecisionRisks("SALES", strategicProfile),
      followUpWindow: "within 48 hours",
      evidenceRefs: evidenceRefsFromContext(context, [
        "sales",
        "company",
        "finance",
        "operations",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(operationsText, [
      "capacity",
      "kapasite",
      "bottleneck",
      "darbogaz",
      "delivery_risk",
      "delivery",
      "teslimat",
    ])
  ) {
    decisions.push({
      id: "decision-domain-capacity-bottleneck",
      title: "Kapasite darbogazi cozulmeden yeni teslimat taahhudu verme",
      category: "OPERATIONS",
      priority: adjustPriorityForStrategy("HIGH", "OPERATIONS", strategicProfile),
      rationale:
        "Operations signals show delivery, capacity, or bottleneck pressure. New commitments should not grow faster than the company can deliver reliably.",
      expectedImpact:
        "Protects delivery reliability and reduces the risk of damaging customers through overcommitment.",
      confidence: signalConfidence({
        primarySignals: context.operationsSignals,
        supportingSignals: [
          ...(context.salesSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.74,
      }),
      recommendedActions: [
        "Freeze or sequence new delivery promises until the bottleneck owner and deadline are clear.",
        "Name the operational constraint, owner, capacity limit, and recovery date.",
        "Accept new work only if delivery capacity and quality risk stay controlled.",
      ],
      risks: buildDecisionRisks("OPERATIONS", strategicProfile),
      followUpWindow: "within 48 hours",
      evidenceRefs: evidenceRefsFromContext(context, [
        "operations",
        "sales",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(personnelText, [
      "performance",
      "performans",
      "training",
      "egitim",
      "role",
      "rol",
      "team_size",
      "ekip",
    ])
  ) {
    decisions.push({
      id: "decision-domain-people-performance",
      title: "Performans dususunu kisi rol egitim ve sistem ayrimiyla ele al",
      category: "PEOPLE",
      priority: adjustPriorityForStrategy("HIGH", "PEOPLE", strategicProfile),
      rationale:
        "People signals show performance or role-fit pressure. A mature people decision should separate person, role, training, system, and delivery impact before escalating.",
      expectedImpact:
        "Improves team continuity while reducing the chance of making a premature people decision.",
      confidence: signalConfidence({
        primarySignals: context.personnelSignals,
        supportingSignals: [
          ...(context.operationsSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.72,
      }),
      recommendedActions: [
        "Run one structured performance conversation around role fit, training need, and expected output.",
        "Separate the employee issue from process, capacity, and management-system causes.",
        "Set a dated improvement plan before making a harder people decision.",
      ],
      risks: buildDecisionRisks("PEOPLE", strategicProfile),
      followUpWindow: "within 7 days",
      evidenceRefs: evidenceRefsFromContext(context, [
        "personnel",
        "operations",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  if (
    hasAny(customerText, [
      "retention",
      "kayip",
      "unhappy",
      "memnun",
      "strategic customer",
      "stratejik musteri",
      "relationship",
      "iliski",
    ])
  ) {
    decisions.push({
      id: "decision-domain-customer-retention",
      title: "Stratejik musteriyi kaybetmemek icin sahiplenme plani baslat",
      category: "CUSTOMER",
      priority: adjustPriorityForStrategy("HIGH", "CUSTOMER", strategicProfile),
      rationale:
        "Customer signals show retention or relationship risk. The executive decision should protect the account while fixing the delivery and operating root cause.",
      expectedImpact:
        "Protects strategic revenue, trust, and reputation while forcing the service recovery plan into ownership.",
      confidence: signalConfidence({
        primarySignals: context.customerSignals,
        supportingSignals: [
          ...(context.operationsSignals ?? []),
          ...(context.memorySignals ?? []),
        ],
        strategicProfile,
        base: 0.72,
      }),
      recommendedActions: [
        "Call the strategic customer with ownership, not excuses.",
        "Explain the recovery action, owner, deadline, and next follow-up date.",
        "Fix the delivery root cause before making new promises.",
      ],
      risks: buildDecisionRisks("CUSTOMER", strategicProfile),
      followUpWindow: "within 48 hours",
      evidenceRefs: evidenceRefsFromContext(context, [
        "customer",
        "operations",
        "memory",
      ]),
      sourceRank: -2,
    });
  }

  return decisions;
}

function buildStrategicGapDecisions(
  assessment: ExecutiveAssessment,
  strategicProfile: StrategicProfile,
): DecisionCandidate[] {
  if (strategicProfile.missingSignals.length <= 4) {
    return [];
  }

  return [
    {
      id: "decision-establish-strategic-context",
      title: "Stratejik karar kalitesini artirmak icin eksik sinyalleri tamamla",
      category: "STRATEGY",
      priority: "MEDIUM",
      rationale:
        "Strategic profile has too many missing signals, so executive decisions should first improve strategy visibility.",
      expectedImpact:
        "Improves future decision quality by clarifying growth, risk, finance, customer, people, and operations preferences.",
      confidence: roundToTwoDecimals(
        Math.max(0.15, Math.min(0.75, assessment.visibility.memoryVisibility.confidence)),
      ),
      recommendedActions: [
        "Capture the current top goal.",
        "Clarify cash, growth, customer, people, and operations priorities.",
        "Attach future decisions to evidence-backed strategy signals.",
      ],
      risks: [
        "Decisions may stay conservative until strategy evidence improves.",
        "Strategic assumptions may be wrong if not confirmed by behavior.",
      ],
      followUpWindow: "within 7 days",
      evidenceRefs: strategicProfile.evidence.map((item) => item.id),
      sourceRank: 20,
    },
  ];
}

function buildFallbackDecision(
  assessment: ExecutiveAssessment,
  council: ExecutiveCouncil,
  strategicProfile: StrategicProfile,
): DecisionCandidate {
  return {
    id: "decision-build-executive-context",
    title: "Asgari yonetim gorunurlugunu tamamla",
    category: "STRATEGY",
    priority: "MEDIUM",
    rationale:
      council.findings[0]?.explanation ??
      assessment.summary ??
      "There is not enough executive context to select a stronger management decision.",
    expectedImpact:
      "Improves the next executive decision by increasing visibility and reducing unsupported assumptions.",
    confidence: roundToTwoDecimals(
      Math.max(0.1, Math.min(0.55, strategicProfile.confidence.score)),
    ),
    recommendedActions: [
      "Clarify the most important company goal.",
      "Capture cash, customer, people, and operations constraints.",
      "Review the next decision after more signals are available.",
    ],
    risks: [
      "Decision quality remains limited while evidence is thin.",
      "The system may stay conservative until context improves.",
    ],
    followUpWindow: "within 7 days",
    evidenceRefs: strategicProfile.evidence.map((item) => item.id),
    sourceRank: 99,
  };
}

function buildRationale(
  explanation: string,
  strategicProfile: StrategicProfile,
): string {
  if (strategicProfile.confidence.level === "LOW") {
    return `${explanation} Strategic profile confidence is low, so this decision should be treated as a cautious recommendation.`;
  }

  return `${explanation} Strategic profile indicates ${strategicProfile.growthStrategy} growth posture and ${strategicProfile.financialStrategy} financial posture.`;
}

function buildExpectedImpact(
  category: ExecutiveDecisionCategory,
  priority: ExecutiveDecisionPriority,
  strategicProfile: StrategicProfile,
): string {
  if (category === "FINANCE") {
    return strategicProfile.riskTolerance === "low"
      ? "Protects cash visibility and reduces financial exposure before taking new risk."
      : "Improves cash control while preserving room for controlled commercial action.";
  }

  if (category === "SALES" || category === "CUSTOMER") {
    return strategicProfile.growthStrategy === "profitability_first_growth"
      ? "Improves commercial focus while protecting margin quality."
      : "Improves customer and revenue visibility for better growth decisions.";
  }

  if (category === "OPERATIONS") {
    return "Improves delivery reliability, capacity visibility, and execution control.";
  }

  if (category === "PEOPLE") {
    return "Improves team capacity visibility and reduces people continuity risk.";
  }

  return priority === "CRITICAL"
    ? "Reduces immediate management risk by forcing an executive-level decision."
    : "Improves management clarity and prepares the next higher-quality decision.";
}

function buildRecommendedActions(input: {
  category: ExecutiveDecisionCategory;
  suggestedAction: string;
  strategicProfile: StrategicProfile;
}): string[] {
  const baseActions = [input.suggestedAction];

  if (input.category === "FINANCE") {
    return input.strategicProfile.riskTolerance === "high"
      ? [
          ...baseActions,
          "Keep growth options open, but define the maximum acceptable cash exposure.",
          "Review this decision after the next collection or cashflow signal.",
        ]
      : [
          ...baseActions,
          "Do not increase exposure until cash or payment terms are clear.",
          "Review this decision after written payment or cashflow evidence is available.",
        ];
  }

  if (input.category === "SALES" || input.category === "CUSTOMER") {
    return input.strategicProfile.financialStrategy === "profitability_first"
      ? [
          ...baseActions,
          "Protect margin before pursuing growth volume.",
          "Separate strategic customers from low-quality demand.",
        ]
      : [
          ...baseActions,
          "Use this decision to improve pipeline or customer relationship visibility.",
          "Define the next commercial commitment and owner.",
        ];
  }

  if (input.category === "OPERATIONS") {
    return [
      ...baseActions,
      "Assign an owner and deadline for the operational constraint.",
      "Check whether new work should wait until capacity is clear.",
    ];
  }

  if (input.category === "PEOPLE") {
    return [
      ...baseActions,
      "Separate person, role, training, and capacity causes.",
      "Set one follow-up date for the people decision.",
    ];
  }

  return [
    ...baseActions,
    "Write down the owner, next step, and review date.",
  ];
}

function buildDecisionRisks(
  category: ExecutiveDecisionCategory,
  strategicProfile: StrategicProfile,
): string[] {
  const risks = ["Recommendation only; no action is executed automatically."];

  if (strategicProfile.confidence.level === "LOW") {
    risks.push("Strategic profile confidence is low, so assumptions may change.");
  }

  if (category === "FINANCE") {
    risks.push(
      strategicProfile.riskTolerance === "high"
        ? "High risk tolerance can hide cash exposure if limits are not explicit."
        : "Low risk tolerance can slow growth if all exposure is blocked.",
    );
  }

  if (category === "SALES" || category === "CUSTOMER") {
    risks.push(
      strategicProfile.growthStrategy === "profitability_first_growth"
        ? "Strict margin protection can reduce short-term sales conversion."
        : "Growth focus can increase operational or cash exposure if unchecked.",
    );
  }

  return risks;
}

function inferCategory(title: string, explanation: string): ExecutiveDecisionCategory {
  const text = normalizeText(`${title} ${explanation}`);

  if (hasAny(text, ["cash", "collection", "finance", "payment", "margin", "receivable"])) {
    return "FINANCE";
  }

  if (hasAny(text, ["sales", "revenue", "pipeline", "quote", "pricing"])) {
    return "SALES";
  }

  if (hasAny(text, ["customer", "account", "relationship"])) {
    return "CUSTOMER";
  }

  if (hasAny(text, ["delivery", "operations", "capacity", "process", "execution"])) {
    return "OPERATIONS";
  }

  if (hasAny(text, ["people", "team", "employee", "hiring", "performance"])) {
    return "PEOPLE";
  }

  if (hasAny(text, ["follow-up", "memory", "decision", "coordination"])) {
    return "EXECUTION";
  }

  return "STRATEGY";
}

function adjustPriorityForStrategy(
  priority: ExecutiveDecisionPriority,
  category: ExecutiveDecisionCategory,
  strategicProfile: StrategicProfile,
): ExecutiveDecisionPriority {
  if (category === "FINANCE" && strategicProfile.riskTolerance === "low") {
    return raisePriority(priority);
  }

  if (
    (category === "SALES" || category === "CUSTOMER") &&
    strategicProfile.growthStrategy === "profitability_first_growth"
  ) {
    return lowerPriority(priority);
  }

  if (
    (category === "SALES" || category === "CUSTOMER") &&
    strategicProfile.riskTolerance === "high"
  ) {
    return raisePriority(priority);
  }

  if (
    category === "OPERATIONS" &&
    strategicProfile.growthStrategy === "operational_capacity_first"
  ) {
    return raisePriority(priority);
  }

  return priority;
}

function priorityFromSeverity(
  severity: ExecutiveBrainSeverity,
): ExecutiveDecisionPriority {
  if (severity === "CRITICAL") {
    return "CRITICAL";
  }

  if (severity === "HIGH") {
    return "HIGH";
  }

  if (severity === "MEDIUM") {
    return "MEDIUM";
  }

  return "LOW";
}

function priorityFromImpact(impact: ExecutiveBrainImpact): ExecutiveDecisionPriority {
  if (impact === "HIGH") {
    return "HIGH";
  }

  if (impact === "MEDIUM") {
    return "MEDIUM";
  }

  return "LOW";
}

function raisePriority(priority: ExecutiveDecisionPriority): ExecutiveDecisionPriority {
  const next: Record<ExecutiveDecisionPriority, ExecutiveDecisionPriority> = {
    LOW: "MEDIUM",
    MEDIUM: "HIGH",
    HIGH: "CRITICAL",
    CRITICAL: "CRITICAL",
  };

  return next[priority];
}

function lowerPriority(priority: ExecutiveDecisionPriority): ExecutiveDecisionPriority {
  const next: Record<ExecutiveDecisionPriority, ExecutiveDecisionPriority> = {
    LOW: "LOW",
    MEDIUM: "LOW",
    HIGH: "MEDIUM",
    CRITICAL: "HIGH",
  };

  return next[priority];
}

function followUpWindowForPriority(priority: ExecutiveDecisionPriority): string {
  if (priority === "CRITICAL") {
    return "today";
  }

  if (priority === "HIGH") {
    return "within 48 hours";
  }

  if (priority === "MEDIUM") {
    return "within 7 days";
  }

  return "within 14 days";
}

function calculateDecisionConfidence(
  evidenceCount: number,
  strategicConfidence: number,
  strength: ExecutiveBrainSeverity | ExecutiveBrainImpact,
): number {
  const strengthScore =
    strength === "CRITICAL" || strength === "HIGH"
      ? 0.25
      : strength === "MEDIUM"
        ? 0.15
        : 0.05;

  return roundToTwoDecimals(
    Math.max(
      0.1,
      Math.min(0.95, evidenceCount * 0.05 + strategicConfidence * 0.45 + strengthScore),
    ),
  );
}

function calculatePackageConfidence(
  primaryDecision: ExecutiveDecision,
  supportingDecisions: ExecutiveDecision[],
): number {
  if (supportingDecisions.length === 0) {
    return primaryDecision.confidence;
  }

  const total =
    primaryDecision.confidence +
    supportingDecisions.reduce((sum, decision) => sum + decision.confidence, 0);

  return roundToTwoDecimals(total / (supportingDecisions.length + 1));
}

function compareDecisionCandidates(
  left: DecisionCandidate,
  right: DecisionCandidate,
): number {
  return (
    priorityRank(right.priority) - priorityRank(left.priority) ||
    right.confidence - left.confidence ||
    left.sourceRank - right.sourceRank ||
    left.title.localeCompare(right.title, "en")
  );
}

function priorityRank(priority: ExecutiveDecisionPriority): number {
  const ranks: Record<ExecutiveDecisionPriority, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  return ranks[priority];
}

function isContextGapText(title: string, explanation: string): boolean {
  const text = normalizeText(`${title} ${explanation}`);

  return hasAny(text, [
    "visibility",
    "context",
    "signals",
    "gorunurluk",
    "sinyal",
    "clarify",
    "build",
    "create",
    "prepare",
  ]);
}

function signalText(signals: ExecutiveBrainContext["financeSignals"]): string {
  return (signals ?? [])
    .map((signal) => `${signal.key ?? ""} ${signal.value ?? ""} ${signal.text ?? ""}`)
    .join(" ")
    .toLocaleLowerCase("en");
}

function evidenceRefsFromContext(
  context: ExecutiveBrainContext,
  domains: Array<
    "company" | "customer" | "finance" | "memory" | "operations" | "personnel" | "sales"
  >,
): string[] {
  const signalsByDomain: Record<
    "company" | "customer" | "finance" | "memory" | "operations" | "personnel" | "sales",
    ExecutiveBrainContext["financeSignals"]
  > = {
    company: context.companySignals,
    customer: context.customerSignals,
    finance: context.financeSignals,
    memory: context.memorySignals,
    operations: context.operationsSignals,
    personnel: context.personnelSignals,
    sales: context.salesSignals,
  };

  return uniqueStrings(
    domains.flatMap((domain) =>
      (signalsByDomain[domain] ?? []).map(
        (signal) =>
          signal.evidenceRef ??
          signal.id ??
          `context:${domain}:${signal.key ?? "signal"}`,
      ),
    ),
  );
}

function signalConfidence(input: {
  primarySignals?: ExecutiveBrainContext["financeSignals"];
  supportingSignals?: ExecutiveBrainContext["financeSignals"];
  strategicProfile: StrategicProfile;
  base: number;
}): number {
  const primaryCount = input.primarySignals?.length ?? 0;
  const supportingCount = input.supportingSignals?.length ?? 0;
  const evidenceBoost = Math.min(0.12, primaryCount * 0.03 + supportingCount * 0.01);
  const strategicBoost = input.strategicProfile.confidence.score * 0.08;

  return roundToTwoDecimals(
    Math.max(0.2, Math.min(0.95, input.base + evidenceBoost + strategicBoost)),
  );
}

function toExecutiveDecision(candidate: DecisionCandidate): ExecutiveDecision {
  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    priority: candidate.priority,
    rationale: candidate.rationale,
    expectedImpact: candidate.expectedImpact,
    confidence: candidate.confidence,
    recommendedActions: candidate.recommendedActions,
    risks: candidate.risks,
    followUpWindow: candidate.followUpWindow,
    evidenceRefs: candidate.evidenceRefs,
  };
}

function buildExecutiveSummary(
  primaryDecision: ExecutiveDecision,
  supportingDecisions: ExecutiveDecision[],
): string {
  return `Today the primary executive decision is: ${primaryDecision.title}. It is ${primaryDecision.priority} priority, with ${supportingDecisions.length} supporting decisions.`;
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("en").trim();
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
