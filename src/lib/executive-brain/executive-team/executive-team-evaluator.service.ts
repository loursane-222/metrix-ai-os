import type {
  ExecutiveAssessment,
  ExecutiveBrainContext,
  ExecutiveVisibilityAssessmentItem,
} from "../executive-brain.types";
import { listExecutiveDirectors } from "./executive-team-registry.service";
import type {
  ExecutiveDirectorAssessment,
  ExecutiveDirectorFinding,
  ExecutiveDirectorPriority,
  ExecutiveDirectorRecommendation,
  ExecutiveDirectorRegistryItem,
  ExecutiveDirectorRole,
} from "./executive-team.types";

type DirectorEvaluationInput = {
  context: ExecutiveBrainContext;
  assessment: ExecutiveAssessment;
  director: ExecutiveDirectorRegistryItem;
};

export function evaluateExecutiveTeam(
  context: ExecutiveBrainContext,
  assessment: ExecutiveAssessment,
): ExecutiveDirectorAssessment[] {
  return listExecutiveDirectors().map((director) =>
    evaluateDirector({ context, assessment, director }),
  );
}

function evaluateDirector(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  if (input.director.role === "sales-director") {
    return evaluateSalesDirector(input);
  }

  if (input.director.role === "finance-director") {
    return evaluateFinanceDirector(input);
  }

  if (input.director.role === "operations-director") {
    return evaluateOperationsDirector(input);
  }

  if (input.director.role === "people-director") {
    return evaluatePeopleDirector(input);
  }

  if (input.director.role === "customer-success-director") {
    return evaluateCustomerSuccessDirector(input);
  }

  if (input.director.role === "executive-assistant") {
    return evaluateExecutiveAssistant(input);
  }

  return evaluateDefaultDirector(input);
}

function evaluateSalesDirector(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  const visibility = input.assessment.visibility.customerVisibility;
  const evidenceRefs = input.assessment.recognition.customers.evidenceRefs;
  const findings: ExecutiveDirectorFinding[] = [];

  if (visibility.state === "LOW") {
    findings.push({
      id: "sales-customer-visibility-low",
      severity: "MEDIUM",
      title: "Customer and sales visibility is low",
      explanation:
        "Customer type, relationship value, and active sales exposure are not visible enough for strong revenue judgment.",
      evidenceRefs,
    });
  }

  return buildDirectorAssessment({
    director: input.director,
    visibility,
    findings,
    priorities: buildVisibilityPriority({
      role: "sales-director",
      visibility,
      title: "Clarify customer and sales exposure",
      explanation:
        "Sales direction needs customer type, current opportunity, and relationship value signals.",
      suggestedAction:
        "Capture primary customer type, active sales pipeline, and relationship value before expanding commercial exposure.",
      evidenceRefs,
    }),
    recommendations: buildVisibilityRecommendation({
      role: "sales-director",
      visibility,
      title: "Strengthen sales context",
      explanation:
        "Revenue advice will improve when customer segmentation and current deal context are known.",
      suggestedAction:
        "Collect customer segment, key accounts, open quotes, and current sales focus.",
      evidenceRefs,
    }),
  });
}

function evaluateFinanceDirector(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  const visibility = input.assessment.visibility.financeVisibility;
  const evidenceRefs = input.assessment.recognition.finance.evidenceRefs;
  const findings: ExecutiveDirectorFinding[] = [];

  if (visibility.state === "LOW") {
    findings.push({
      id: "finance-visibility-low",
      severity: "HIGH",
      title: "Financial visibility is low",
      explanation:
        "Cashflow, collection, profitability, receivable, and payment risk signals are not visible enough.",
      evidenceRefs,
    });
  }

  return buildDirectorAssessment({
    director: input.director,
    visibility,
    findings,
    priorities: buildVisibilityPriority({
      role: "finance-director",
      visibility,
      title: "Build cash and collection visibility",
      explanation:
        "Finance direction needs cash priority, open balance, collection status, and profitability signals.",
      suggestedAction:
        "Capture cashflow priority, open receivables, overdue payments, and profitability focus.",
      evidenceRefs,
    }),
    recommendations: buildVisibilityRecommendation({
      role: "finance-director",
      visibility,
      title: "Create finance operating context",
      explanation:
        "Executive finance judgment should start from cash exposure and payment reliability.",
      suggestedAction:
        "Track overdue balances, promised payment dates, margin pressure, and weekly cash needs.",
      evidenceRefs,
    }),
  });
}

function evaluateOperationsDirector(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  const visibility = input.assessment.visibility.operationsVisibility;
  const evidenceRefs = input.assessment.recognition.operations.evidenceRefs;
  const findings: ExecutiveDirectorFinding[] = [];

  if (visibility.state === "LOW") {
    findings.push({
      id: "operations-visibility-low",
      severity: "MEDIUM",
      title: "Operations visibility is low",
      explanation:
        "Delivery, process, capacity, and bottleneck signals are not visible enough for execution judgment.",
      evidenceRefs,
    });
  }

  return buildDirectorAssessment({
    director: input.director,
    visibility,
    findings,
    priorities: buildVisibilityPriority({
      role: "operations-director",
      visibility,
      title: "Clarify delivery and capacity signals",
      explanation:
        "Operations direction needs delivery commitments, capacity, bottlenecks, and process risk signals.",
      suggestedAction:
        "Capture active work, delivery dates, capacity constraints, and execution blockers.",
      evidenceRefs,
    }),
    recommendations: buildVisibilityRecommendation({
      role: "operations-director",
      visibility,
      title: "Build operations control context",
      explanation:
        "Operational advice will improve when delivery and capacity risk become visible.",
      suggestedAction:
        "Track active jobs, operational blockers, owner, deadline, and next required action.",
      evidenceRefs,
    }),
  });
}

function evaluatePeopleDirector(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  const visibility = input.assessment.visibility.personnelVisibility;
  const evidenceRefs = input.assessment.recognition.personnel.evidenceRefs;
  const findings: ExecutiveDirectorFinding[] = [];

  if (visibility.state === "LOW") {
    findings.push({
      id: "people-visibility-low",
      severity: "MEDIUM",
      title: "People visibility is low",
      explanation:
        "Team size, hiring need, performance, and continuity signals are not visible enough for people judgment.",
      evidenceRefs,
    });
  }

  return buildDirectorAssessment({
    director: input.director,
    visibility,
    findings,
    priorities: buildVisibilityPriority({
      role: "people-director",
      visibility,
      title: "Clarify team capacity",
      explanation:
        "People direction needs team size, role coverage, hiring pressure, and performance signals.",
      suggestedAction:
        "Capture current team size, critical roles, performance concerns, and hiring needs.",
      evidenceRefs,
    }),
    recommendations: buildVisibilityRecommendation({
      role: "people-director",
      visibility,
      title: "Build people operating context",
      explanation:
        "People advice will improve when team structure and continuity risk are visible.",
      suggestedAction:
        "Track team size, key employees, open roles, performance issues, and retention risk.",
      evidenceRefs,
    }),
  });
}

function evaluateCustomerSuccessDirector(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  const visibility = input.assessment.visibility.customerVisibility;
  const evidenceRefs = input.assessment.recognition.customers.evidenceRefs;
  const customerText = normalizeSignals(input.context.customerSignals);
  const operationsText = normalizeSignals(input.context.operationsSignals);
  const hasRetentionRisk = hasAny(customerText, [
    "retention",
    "kayip",
    "unhappy",
    "memnun",
    "strategic customer",
    "stratejik musteri",
  ]);
  const hasServiceIssue = hasAny(operationsText, [
    "delivery",
    "service",
    "hizmet",
    "aksaklik",
    "gecikme",
  ]);
  const findings: ExecutiveDirectorFinding[] = [];
  const priorities: ExecutiveDirectorPriority[] = [];
  const recommendations: ExecutiveDirectorRecommendation[] = [];

  if (visibility.state === "LOW") {
    findings.push({
      id: "customer-success-visibility-low",
      severity: "MEDIUM",
      title: "Customer success visibility is low",
      explanation:
        "Strategic customer health, retention risk, service history, and relationship ownership are not visible enough.",
      evidenceRefs,
    });
  }

  if (hasRetentionRisk || hasServiceIssue) {
    findings.push({
      id: "customer-success-retention-risk",
      severity: hasRetentionRisk && hasServiceIssue ? "HIGH" : "MEDIUM",
      title: "Strategic customer retention risk is visible",
      explanation:
        "Customer relationship risk should be handled with ownership, root-cause correction, and a clear follow-up plan.",
      evidenceRefs,
    });
    priorities.push({
      id: "customer-success-retention-priority",
      impact: "HIGH",
      title: "Start strategic customer recovery plan",
      explanation:
        "A strategic customer risk should be managed before reputation and repeat revenue are damaged.",
      suggestedAction:
        "Own the customer conversation, explain the recovery plan, assign the operational fix, and set a follow-up date.",
      evidenceRefs,
    });
    recommendations.push({
      id: "customer-success-retention-recommendation",
      impact: "HIGH",
      title: "Protect the strategic customer relationship",
      explanation:
        "Retention improves when the relationship owner, delivery fix, and next follow-up are explicit.",
      suggestedAction:
        "Call the customer with a concrete recovery plan and confirm the next checkpoint in writing.",
      evidenceRefs,
    });
  }

  return buildDirectorAssessment({
    director: input.director,
    visibility,
    findings,
    priorities: [
      ...priorities,
      ...buildVisibilityPriority({
        role: "customer-success-director",
        visibility,
        title: "Clarify strategic customer health",
        explanation:
          "Customer success direction needs retention, relationship value, complaint, and service recovery signals.",
        suggestedAction:
          "Capture strategic accounts, open complaints, renewal risk, and service recovery ownership.",
        evidenceRefs,
      }),
    ],
    recommendations: [
      ...recommendations,
      ...buildVisibilityRecommendation({
        role: "customer-success-director",
        visibility,
        title: "Build customer success context",
        explanation:
          "Customer retention advice improves when relationship health and service recovery are visible.",
        suggestedAction:
          "Track strategic accounts, customer health, complaint owner, and next follow-up date.",
        evidenceRefs,
      }),
    ],
  });
}

function evaluateExecutiveAssistant(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  const visibility = input.assessment.visibility.memoryVisibility;
  const eventReliability = input.context.sourceReliability?.find(
    (source) => source.source === "events",
  );
  const evidenceRefs = [
    ...input.assessment.recognition.company.evidenceRefs,
    ...input.assessment.recognition.owner.evidenceRefs,
  ];
  const findings: ExecutiveDirectorFinding[] = [];

  if (visibility.state === "LOW" || !eventReliability?.connected) {
    findings.push({
      id: "assistant-follow-up-foundation-thin",
      severity: "MEDIUM",
      title: "Follow-up foundation is thin",
      explanation:
        "Memory or event visibility is low, so reminders, follow-ups, and operating rhythm cannot be grounded strongly yet.",
      evidenceRefs,
    });
  }

  return buildDirectorAssessment({
    director: input.director,
    visibility,
    findings,
    priorities: buildVisibilityPriority({
      role: "executive-assistant",
      visibility,
      title: "Build follow-up memory",
      explanation:
        "Executive assistant direction needs memory, events, decisions, and follow-up signals.",
      suggestedAction:
        "Capture important decisions, promised follow-ups, deadlines, and recurring operating rhythm.",
      evidenceRefs,
    }),
    recommendations: buildVisibilityRecommendation({
      role: "executive-assistant",
      visibility,
      title: "Prepare reminder and follow-up context",
      explanation:
        "Coordination will improve when events and memory contain enough follow-up signals.",
      suggestedAction:
        "Track decision owner, due date, next step, and completion state for important actions.",
      evidenceRefs,
    }),
  });
}

function evaluateDefaultDirector(
  input: DirectorEvaluationInput,
): ExecutiveDirectorAssessment {
  const visibility = input.assessment.visibility.memoryVisibility;

  return buildDirectorAssessment({
    director: input.director,
    visibility,
    findings: [],
    priorities: [],
    recommendations: [],
  });
}

function buildDirectorAssessment(input: {
  director: ExecutiveDirectorRegistryItem;
  visibility: ExecutiveVisibilityAssessmentItem;
  findings: ExecutiveDirectorFinding[];
  priorities: ExecutiveDirectorPriority[];
  recommendations: ExecutiveDirectorRecommendation[];
}): ExecutiveDirectorAssessment {
  return {
    id: input.director.id,
    role: input.director.role,
    title: input.director.title,
    findings: input.findings,
    recommendations: input.recommendations,
    priorities: input.priorities,
    confidence: input.visibility.confidence,
  };
}

function buildVisibilityPriority(input: {
  role: ExecutiveDirectorRole;
  visibility: ExecutiveVisibilityAssessmentItem;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
}): ExecutiveDirectorPriority[] {
  if (input.visibility.state !== "LOW") {
    return [];
  }

  return [
    {
      id: `${input.role}-visibility-priority`,
      impact: "HIGH",
      title: input.title,
      explanation: input.explanation,
      suggestedAction: input.suggestedAction,
      evidenceRefs: input.evidenceRefs,
    },
  ];
}

function buildVisibilityRecommendation(input: {
  role: ExecutiveDirectorRole;
  visibility: ExecutiveVisibilityAssessmentItem;
  title: string;
  explanation: string;
  suggestedAction: string;
  evidenceRefs: string[];
}): ExecutiveDirectorRecommendation[] {
  if (input.visibility.state === "HIGH") {
    return [];
  }

  return [
    {
      id: `${input.role}-visibility-recommendation`,
      impact: input.visibility.state === "LOW" ? "HIGH" : "MEDIUM",
      title: input.title,
      explanation: input.explanation,
      suggestedAction: input.suggestedAction,
      evidenceRefs: input.evidenceRefs,
    },
  ];
}

function normalizeSignals(signals: ExecutiveBrainContext["customerSignals"]): string {
  return (signals ?? [])
    .map((signal) => `${signal.key ?? ""} ${signal.value ?? ""} ${signal.text ?? ""}`)
    .join(" ")
    .toLocaleLowerCase("en");
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}
