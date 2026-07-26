import type {
  ExecutiveBrainAssessment,
  ExecutiveBrainContext,
  ExecutiveBrainRecognitionDomain,
  ExecutiveBrainSeverity,
  ExecutiveBrainSignal,
} from "@/lib/executive-brain/executive-brain.types";
import type {
  ExecutiveAssessmentCategoryV1,
  ExecutiveAssessmentConfidenceV1,
  ExecutiveAssessmentDirectiveSignalsV1,
  ExecutiveAssessmentEvidenceKindV1,
  ExecutiveAssessmentEvidenceV1,
  ExecutiveAssessmentV1,
} from "./executive-assessment.contracts";
import { freezeExecutiveAssessmentV1 } from "./executive-assessment.validation";
import type { ExecutiveManagementPictureV1 } from "@/lib/executive-management-picture";
import { buildExecutiveAssessment } from "@/lib/executive-brain/executive-brain-assessment.service";

const SIGNAL_GROUPS = [
  ["owner", "ownerSignals"],
  ["company", "companySignals"],
  ["customers", "customerSignals"],
  ["personnel", "personnelSignals"],
  ["sales", "salesSignals"],
  ["finance", "financeSignals"],
  ["operations", "operationsSignals"],
  ["company", "memorySignals"],
] as const satisfies readonly [
  ExecutiveAssessmentCategoryV1,
  keyof ExecutiveBrainContext,
][];

export function adaptExecutiveBrainAssessmentV1(input: Readonly<{
  picture: ExecutiveManagementPictureV1;
  assessment: ExecutiveBrainAssessment;
  generatedAt?: string;
  assessmentId?: string;
}>): ExecutiveAssessmentV1 {
  const context = managementPictureToInternalContext(input.picture);
  const evidence = buildEvidence(context);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const evidenceGaps = uniqueStrings(
    [
      ...input.picture.readiness.missingRequiredSources,
      ...input.picture.evidence.evidenceGaps,
      ...Object.values(input.assessment.recognition).flatMap((item) => item.missingSignals),
    ],
  );
  const confidence = assessmentConfidence(input.assessment);
  const findings = input.picture.readiness.assessmentReady
    ? input.assessment.findings.flatMap((finding) => {
        const references = finding.evidenceRefs.filter((ref) => evidenceIds.has(ref));
        return references.length > 0
          ? [{
              id: finding.id,
              category: inferCategory(finding.id, finding.title),
              severity: finding.severity,
              summary: finding.explanation,
              evidenceReferences: references,
              confidence,
              isAssumption: false,
            } as const]
          : [];
      })
    : [];
  const risks = findings
    .filter((finding) => finding.severity !== "LOW")
    .map((finding) => ({
      id: `risk:${finding.id}`,
      category: finding.category,
      severity: finding.severity,
      likelihood: finding.confidence === "HIGH" ? "HIGH" : finding.confidence === "MEDIUM" ? "MEDIUM" : "LOW",
      timeHorizon: finding.severity === "CRITICAL" ? "IMMEDIATE" : "NEAR_TERM",
      reversibility: finding.severity === "CRITICAL"
        ? "PARTIALLY_REVERSIBLE"
        : "REVERSIBLE",
      evidenceReferences: finding.evidenceReferences,
      confidence: finding.confidence,
    } as const));
  const opportunities = input.picture.readiness.assessmentReady
    ? evidence
    .filter((item) => /\b(growth|buyume|firsat|opportunity|pipeline|retention)\b/iu.test(item.summary))
    .map((item) => ({
      id: `opportunity:${item.id}`,
      category: item.category,
      potentialValue: "MEDIUM" as const,
      probability: item.confidence === "HIGH" ? "HIGH" as const : "MEDIUM" as const,
      timeWindow: "NEAR_TERM" as const,
      requiredConditions: ["Confirm the signal and define accountable ownership."],
      evidenceReferences: [item.id],
      confidence: item.confidence,
    }))
    : [];
  const decisionFactors = findings.map((finding) => ({
    id: `factor:${finding.id}`,
    category: finding.category,
    summary: finding.summary,
    weight: severityWeight(finding.severity),
    evidenceReferences: finding.evidenceReferences,
  }));
  const status = !input.picture.readiness.assessmentReady || evidence.length === 0
    ? "PARTIAL"
    : evidenceGaps.length > 0
      ? "PARTIAL"
      : "AVAILABLE";

  return freezeExecutiveAssessmentV1({
    schemaVersion: "1.0",
    assessmentId: input.assessmentId ?? `executive-assessment:${input.picture.pictureId}`,
    source: "executive_brain",
    status,
    evidence,
    findings,
    risks,
    opportunities,
    tradeoffs: [],
    decisionFactors,
    timeImpact: {
      immediate: risks.filter((risk) => risk.timeHorizon === "IMMEDIATE").map((risk) => risk.id),
      nearTerm: risks.filter((risk) => risk.timeHorizon === "NEAR_TERM").map((risk) => risk.id),
      longTerm: [],
    },
    evidenceGaps,
    confidence: input.picture.readiness.assessmentReady
      ? status === "PARTIAL" && confidence === "HIGH" ? "MEDIUM" : confidence
      : "LOW",
    generatedAt: normalizeGeneratedAt(input.generatedAt ?? input.picture.generatedAt),
  });
}

export function buildExecutiveAssessmentFromManagementPicture(
  picture: ExecutiveManagementPictureV1,
): Readonly<{
  internalAssessment: ExecutiveBrainAssessment;
  assessment: ExecutiveAssessmentV1;
}> {
  const internalAssessment = buildExecutiveAssessment(managementPictureToInternalContext(picture));
  return Object.freeze({
    internalAssessment,
    assessment: adaptExecutiveBrainAssessmentV1({
      picture,
      assessment: internalAssessment,
      generatedAt: picture.generatedAt,
      assessmentId: `${picture.conversationId ?? picture.organizationId}:${picture.requestId ?? picture.pictureId}`,
    }),
  });
}

export function managementPictureToInternalContext(
  picture: ExecutiveManagementPictureV1,
): ExecutiveBrainContext {
  return {
    now: picture.time.now,
    ownerSignals: [...picture.managementReality.ownerSignals],
    companySignals: [...picture.managementReality.companySignals],
    customerSignals: [...picture.managementReality.customerSignals],
    personnelSignals: [...picture.managementReality.personnelSignals],
    salesSignals: [...picture.managementReality.salesSignals],
    financeSignals: [...picture.managementReality.financeSignals],
    operationsSignals: [...picture.managementReality.operationsSignals],
    memorySignals: [...picture.managementReality.memorySignals],
    sourceReliability: [...picture.evidence.sourceReliability],
  };
}

export function projectExecutiveAssessmentToDirectiveSignals(
  assessment: ExecutiveAssessmentV1,
): ExecutiveAssessmentDirectiveSignalsV1 {
  const severityOrder: ExecutiveBrainSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const highestRisk = assessment.risks.reduce<ExecutiveBrainSeverity | null>(
    (current, risk) =>
      current === null || severityOrder.indexOf(risk.severity) > severityOrder.indexOf(current)
        ? risk.severity
        : current,
    null,
  );
  return Object.freeze({
    status: assessment.status,
    highestRisk,
    hasEvidenceGaps: assessment.evidenceGaps.length > 0,
    hasImmediateTimePressure: assessment.timeImpact.immediate.length > 0,
    decisionFactorCount: assessment.decisionFactors.length,
    confidence: assessment.confidence,
  });
}

function buildEvidence(context: ExecutiveBrainContext): ExecutiveAssessmentEvidenceV1[] {
  return SIGNAL_GROUPS.flatMap(([category, key]) => {
    const signals = context[key];
    return Array.isArray(signals)
      ? signals.map((signal, index) => mapEvidence(category, signal, index))
      : [];
  });
}

function mapEvidence(
  category: ExecutiveAssessmentCategoryV1,
  signal: ExecutiveBrainSignal,
  index: number,
): ExecutiveAssessmentEvidenceV1 {
  return {
    id: signal.evidenceRef ?? signal.id ?? `${category}:${index}:${signal.key ?? "signal"}`,
    kind: evidenceKind(signal.source, category),
    category,
    source: signal.source ?? category,
    summary: [signal.key ?? signal.category, signal.value ?? signal.text]
      .filter(Boolean)
      .join(": "),
    confidence: numericConfidence(signal.confidence),
  };
}

function evidenceKind(
  source: string | undefined,
  category: ExecutiveAssessmentCategoryV1,
): ExecutiveAssessmentEvidenceKindV1 {
  const normalized = source?.toLowerCase() ?? "";
  if (normalized.includes("memory") || category === "company" && normalized === "") return "MEMORY";
  if (normalized.includes("user")) return "USER_STATEMENT";
  if (normalized.includes("decision")) return "PRIOR_DECISION";
  if (normalized.includes("action") || normalized.includes("event")) return "ACTION_RESULT";
  if (normalized.includes("external")) return "EXTERNAL_CONTEXT";
  return "DOMAIN_RECORD";
}

function inferCategory(id: string, title: string): ExecutiveAssessmentCategoryV1 {
  const text = `${id} ${title}`.toLowerCase();
  const domains: ExecutiveBrainRecognitionDomain[] = [
    "finance", "customers", "personnel", "operations", "company", "owner",
  ];
  return domains.find((domain) => text.includes(domain)) ?? "strategy";
}

function assessmentConfidence(
  assessment: ExecutiveBrainAssessment,
): ExecutiveAssessmentConfidenceV1 {
  const values = Object.values(assessment.visibility).map((item) => item.confidence);
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  return numericConfidence(average);
}

function numericConfidence(value: number | undefined): ExecutiveAssessmentConfidenceV1 {
  if ((value ?? 0) >= 0.75) return "HIGH";
  if ((value ?? 0) >= 0.45) return "MEDIUM";
  return "LOW";
}

function severityWeight(severity: ExecutiveBrainSeverity): "LOW" | "MEDIUM" | "HIGH" {
  if (severity === "CRITICAL" || severity === "HIGH") return "HIGH";
  return severity;
}

function normalizeGeneratedAt(value: string | Date | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? new Date(value).toISOString() : new Date().toISOString();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
