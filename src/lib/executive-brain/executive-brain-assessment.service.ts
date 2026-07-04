import type {
  ExecutiveAssessment,
  ExecutiveBrainContext,
  ExecutiveBrainRecognitionDomain,
  ExecutiveBrainRecognitionLabel,
  ExecutiveBrainSignal,
  ExecutiveFinding,
  ExecutiveRecognitionAssessment,
  ExecutiveVisibilityAssessment,
  ExecutiveVisibilityAssessmentItem,
  ExecutiveVisibilityState,
} from "./executive-brain.types";

type RecognitionDefinition = {
  domain: ExecutiveBrainRecognitionDomain;
  signalGroups: Array<keyof ExecutiveBrainContext>;
  expectedSignals: string[];
};

const RECOGNITION_DEFINITIONS: RecognitionDefinition[] = [
  {
    domain: "owner",
    signalGroups: ["ownerSignals", "memorySignals"],
    expectedSignals: [
      "decision_preference",
      "communication_preference",
      "work_preference",
      "personal_preference",
    ],
  },
  {
    domain: "company",
    signalGroups: ["companySignals", "memorySignals"],
    expectedSignals: ["industry", "city", "strategic_focus", "top_goal"],
  },
  {
    domain: "customers",
    signalGroups: ["customerSignals", "salesSignals", "memorySignals"],
    expectedSignals: [
      "primary_customer_type",
      "customer_history",
      "relationship_value",
    ],
  },
  {
    domain: "personnel",
    signalGroups: ["personnelSignals", "memorySignals"],
    expectedSignals: ["team_size", "hiring_need", "performance_issue"],
  },
  {
    domain: "operations",
    signalGroups: ["operationsSignals", "memorySignals"],
    expectedSignals: ["delivery_risk", "capacity", "process_bottleneck"],
  },
  {
    domain: "finance",
    signalGroups: ["financeSignals", "memorySignals"],
    expectedSignals: [
      "cashflow_priority",
      "profitability_focus",
      "open_balance",
      "payment_delay",
    ],
  },
];

export function buildExecutiveAssessment(
  context: ExecutiveBrainContext = {},
): ExecutiveAssessment {
  const visibility = buildVisibilityAssessment(context);
  const recognition = buildRecognitionAssessment(context);
  const findings = buildExecutiveFindings(visibility, recognition);

  return {
    visibility,
    recognition,
    findings,
    summary: buildExecutiveSummary(visibility, findings),
  };
}

function buildVisibilityAssessment(
  context: ExecutiveBrainContext,
): ExecutiveVisibilityAssessment {
  return {
    financeVisibility: assessVisibility({
      sourceName: "finance",
      signals: getSignals(context, "financeSignals"),
      reliabilitySources: ["payments_collections", "events", "memory"],
      context,
    }),
    customerVisibility: assessVisibility({
      sourceName: "customer",
      signals: [
        ...getSignals(context, "customerSignals"),
        ...getSignals(context, "salesSignals"),
      ],
      reliabilitySources: ["people", "quotes", "events"],
      context,
    }),
    personnelVisibility: assessVisibility({
      sourceName: "personnel",
      signals: getSignals(context, "personnelSignals"),
      reliabilitySources: ["people", "memory"],
      context,
    }),
    operationsVisibility: assessVisibility({
      sourceName: "operations",
      signals: getSignals(context, "operationsSignals"),
      reliabilitySources: ["jobs_work_schedule", "events", "memory"],
      context,
    }),
    memoryVisibility: assessVisibility({
      sourceName: "memory",
      signals: getSignals(context, "memorySignals"),
      reliabilitySources: ["memory"],
      context,
    }),
  };
}

function buildRecognitionAssessment(
  context: ExecutiveBrainContext,
): ExecutiveRecognitionAssessment {
  return RECOGNITION_DEFINITIONS.reduce<ExecutiveRecognitionAssessment>(
    (result, definition) => {
      const signals = collectSignals(context, definition.signalGroups);
      const knownSignals = definition.expectedSignals.filter((signalKey) =>
        signals.some((signal) => signalMatches(signal, signalKey)),
      );
      const score = calculateScore(
        knownSignals.length,
        definition.expectedSignals.length,
        signals.length,
      );

      result[definition.domain] = {
        score,
        label: labelScore(score),
        explanation: buildRecognitionExplanation(
          definition.domain,
          knownSignals.length,
          definition.expectedSignals.length,
          signals.length,
        ),
        signalCount: signals.length,
        missingSignals: definition.expectedSignals.filter(
          (signalKey) => !knownSignals.includes(signalKey),
        ),
        evidenceRefs: signals.map(buildEvidenceRef),
      };

      return result;
    },
    createEmptyRecognitionAssessment(),
  );
}

function buildExecutiveFindings(
  visibility: ExecutiveVisibilityAssessment,
  recognition: ExecutiveRecognitionAssessment,
): ExecutiveFinding[] {
  const findings: ExecutiveFinding[] = [];

  if (visibility.customerVisibility.state === "LOW") {
    findings.push({
      id: "customer-knowledge-limited",
      severity: "MEDIUM",
      title: "Customer knowledge is limited",
      explanation:
        "Customer visibility is low, so relationship value, customer type, and sales exposure are not yet clear.",
      evidenceRefs: recognition.customers.evidenceRefs,
    });
  }

  if (visibility.financeVisibility.state === "LOW") {
    findings.push({
      id: "financial-signals-insufficient",
      severity: "HIGH",
      title: "Financial signals insufficient",
      explanation:
        "Finance visibility is low, so cashflow, profitability, receivables, and payment risk cannot be assessed strongly yet.",
      evidenceRefs: recognition.finance.evidenceRefs,
    });
  }

  if (visibility.personnelVisibility.state !== "LOW") {
    findings.push({
      id: "personnel-coverage-growing",
      severity: "LOW",
      title: "Personnel coverage growing",
      explanation:
        "Personnel signals are available, making team and people-related assessment more grounded.",
      evidenceRefs: recognition.personnel.evidenceRefs,
    });
  }

  if (visibility.memoryVisibility.state === "HIGH") {
    findings.push({
      id: "memory-foundation-healthy",
      severity: "LOW",
      title: "Memory foundation healthy",
      explanation:
        "Active memory coverage is high enough to support repeatable executive assessment.",
      evidenceRefs: recognition.company.evidenceRefs,
    });
  } else if (visibility.memoryVisibility.state === "LOW") {
    findings.push({
      id: "memory-foundation-thin",
      severity: "MEDIUM",
      title: "Memory foundation thin",
      explanation:
        "Memory visibility is low, so the executive assessment should remain conservative.",
      evidenceRefs: recognition.company.evidenceRefs,
    });
  }

  if (visibility.operationsVisibility.state === "LOW") {
    findings.push({
      id: "operations-visibility-limited",
      severity: "MEDIUM",
      title: "Operations visibility limited",
      explanation:
        "Operations signals are limited, so delivery, capacity, and execution risk are not yet visible enough.",
      evidenceRefs: recognition.operations.evidenceRefs,
    });
  }

  return findings;
}

function buildExecutiveSummary(
  visibility: ExecutiveVisibilityAssessment,
  findings: ExecutiveFinding[],
): string {
  const visibilityAreas: Array<[string, ExecutiveVisibilityAssessmentItem]> = [
    ["finance", visibility.financeVisibility],
    ["customer", visibility.customerVisibility],
    ["personnel", visibility.personnelVisibility],
    ["operations", visibility.operationsVisibility],
    ["memory", visibility.memoryVisibility],
  ];
  const lowVisibilityAreas = visibilityAreas
    .filter(([, item]) => item.state === "LOW")
    .map(([area]) => area);

  if (findings.length === 0) {
    return "Basic executive visibility is forming and no deterministic finding stands out yet.";
  }

  if (lowVisibilityAreas.length === 0) {
    return "Executive visibility is forming across the company, with enough signals to start management assessment.";
  }

  return `Basic company visibility is forming, but ${lowVisibilityAreas.join(
    ", ",
  )} visibility remains low.`;
}

function assessVisibility(input: {
  sourceName: string;
  signals: ExecutiveBrainSignal[];
  reliabilitySources: string[];
  context: ExecutiveBrainContext;
}): ExecutiveVisibilityAssessmentItem {
  const connectedReliability = (input.context.sourceReliability ?? []).filter(
    (source) => input.reliabilitySources.includes(source.source),
  );
  const connectedCount = connectedReliability.filter(
    (source) => source.connected,
  ).length;
  const averageReliabilityConfidence =
    connectedReliability.length === 0
      ? 0
      : connectedReliability.reduce((sum, source) => sum + source.confidence, 0) /
        connectedReliability.length;
  const state = resolveVisibilityState(
    input.signals.length,
    connectedCount,
    averageReliabilityConfidence,
  );

  return {
    state,
    confidence: roundToTwoDecimals(
      clampNumber(
        input.signals.length * 0.08 + connectedCount * 0.12 + averageReliabilityConfidence * 0.5,
        0.05,
        0.95,
      ),
    ),
    reason: buildVisibilityReason(
      input.sourceName,
      state,
      input.signals.length,
      connectedCount,
    ),
  };
}

function resolveVisibilityState(
  signalCount: number,
  connectedCount: number,
  averageReliabilityConfidence: number,
): ExecutiveVisibilityState {
  if (signalCount >= 5 || (signalCount >= 3 && averageReliabilityConfidence >= 0.6)) {
    return "HIGH";
  }

  if (signalCount >= 2 || connectedCount >= 2 || averageReliabilityConfidence >= 0.45) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildVisibilityReason(
  sourceName: string,
  state: ExecutiveVisibilityState,
  signalCount: number,
  connectedCount: number,
): string {
  if (signalCount === 0) {
    return `${sourceName} visibility is ${state} because no direct signals are available.`;
  }

  return `${sourceName} visibility is ${state} with ${signalCount} signals and ${connectedCount} connected sources.`;
}

function buildRecognitionExplanation(
  domain: ExecutiveBrainRecognitionDomain,
  knownCount: number,
  expectedCount: number,
  signalCount: number,
): string {
  if (signalCount === 0) {
    return `${domain} recognition has no direct signals yet.`;
  }

  return `${domain} recognition is based on ${knownCount} of ${expectedCount} expected signals and ${signalCount} total signals.`;
}

function collectSignals(
  context: ExecutiveBrainContext,
  signalGroups: Array<keyof ExecutiveBrainContext>,
): ExecutiveBrainSignal[] {
  return signalGroups.flatMap((group) => getSignals(context, group));
}

function getSignals(
  context: ExecutiveBrainContext,
  groupName: keyof ExecutiveBrainContext,
): ExecutiveBrainSignal[] {
  const value = context[groupName];

  return Array.isArray(value) ? value : [];
}

function signalMatches(signal: ExecutiveBrainSignal, signalKey: string): boolean {
  const normalizedSignalKey = normalizeText(signal.key ?? signal.category ?? "");
  const normalizedExpectedKey = normalizeText(signalKey);
  const normalizedContent = normalizeText(`${signal.text ?? ""} ${signal.value ?? ""}`);

  return (
    normalizedSignalKey === normalizedExpectedKey ||
    normalizedContent.includes(normalizedExpectedKey.replaceAll("_", " "))
  );
}

function calculateScore(
  knownCount: number,
  expectedCount: number,
  signalCount: number,
): number {
  if (expectedCount === 0 || signalCount === 0) {
    return 0;
  }

  const coverageScore = Math.round((knownCount / expectedCount) * 8);
  const signalBonus = signalCount > knownCount ? 2 : 1;

  return clampInteger(coverageScore + signalBonus, 0, 10);
}

function labelScore(score: number): ExecutiveBrainRecognitionLabel {
  if (score <= 0) {
    return "UNKNOWN";
  }

  if (score <= 3) {
    return "LOW";
  }

  if (score <= 6) {
    return "PARTIAL";
  }

  if (score < 10) {
    return "STRONG";
  }

  return "COMPLETE";
}

function createEmptyRecognitionAssessment(): ExecutiveRecognitionAssessment {
  return {
    owner: emptyRecognitionAssessmentItem(),
    company: emptyRecognitionAssessmentItem(),
    customers: emptyRecognitionAssessmentItem(),
    personnel: emptyRecognitionAssessmentItem(),
    operations: emptyRecognitionAssessmentItem(),
    finance: emptyRecognitionAssessmentItem(),
  };
}

function emptyRecognitionAssessmentItem() {
  return {
    score: 0,
    label: "UNKNOWN" as const,
    explanation: "No signals are available yet.",
    signalCount: 0,
    missingSignals: [],
    evidenceRefs: [],
  };
}

function buildEvidenceRef(signal: ExecutiveBrainSignal, index: number): string {
  return signal.evidenceRef ?? signal.id ?? `signal:${index}`;
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
