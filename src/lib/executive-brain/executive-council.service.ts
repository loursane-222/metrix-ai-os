import type {
  ExecutiveAssessment,
  ExecutiveBrainContext,
  ExecutiveBrainImpact,
  ExecutiveBrainSeverity,
  ExecutiveCouncil,
  ExecutiveCouncilFinding,
  ExecutiveCouncilOpportunity,
  ExecutiveCouncilParticipant,
  ExecutiveCouncilPriority,
  ExecutiveCouncilRecommendation,
  ExecutiveCouncilRisk,
} from "./executive-brain.types";
import { evaluateExecutiveTeam } from "./executive-team/executive-team-evaluator.service";
import type {
  ExecutiveDirectorAssessment,
  ExecutiveDirectorPriority,
  ExecutiveDirectorRecommendation,
} from "./executive-team/executive-team.types";

export function buildExecutiveCouncil(
  context: ExecutiveBrainContext,
  assessment: ExecutiveAssessment,
): ExecutiveCouncil {
  const directorAssessments = evaluateExecutiveTeam(context, assessment);
  const participants = buildParticipants(directorAssessments);
  const findings = groupFindings(directorAssessments);
  const recommendations = groupRecommendations(directorAssessments);
  const priorities = groupPriorities(directorAssessments);
  const risks = buildRisksFromFindings(findings);
  const opportunities = buildOpportunitiesFromRecommendations(recommendations);

  return {
    participants,
    findings,
    risks,
    opportunities,
    priorities: sortPriorities(priorities),
    recommendations: sortRecommendations(recommendations),
    confidence: calculateCouncilConfidence(participants),
    executiveSummary: buildExecutiveSummary({
      participants,
      findings,
      risks,
      priorities,
      recommendations,
    }),
  };
}

function buildParticipants(
  directorAssessments: ExecutiveDirectorAssessment[],
): ExecutiveCouncilParticipant[] {
  return directorAssessments.map((director) => ({
    id: director.id,
    role: director.role,
    title: director.title,
    confidence: director.confidence,
  }));
}

function groupFindings(
  directorAssessments: ExecutiveDirectorAssessment[],
): ExecutiveCouncilFinding[] {
  const grouped = new Map<string, ExecutiveCouncilFinding>();

  for (const director of directorAssessments) {
    for (const finding of director.findings) {
      const groupKey = buildGroupKey(finding.title);
      const current = grouped.get(groupKey);

      if (!current) {
        grouped.set(groupKey, {
          id: `council-finding-${groupKey}`,
          severity: finding.severity,
          title: finding.title,
          explanation: finding.explanation,
          evidenceRefs: uniqueStrings(finding.evidenceRefs),
          participantRefs: [director.id],
        });
        continue;
      }

      grouped.set(groupKey, {
        ...current,
        severity: worstSeverity(current.severity, finding.severity),
        explanation: mergeText(current.explanation, finding.explanation),
        evidenceRefs: uniqueStrings([...current.evidenceRefs, ...finding.evidenceRefs]),
        participantRefs: uniqueStrings([...current.participantRefs, director.id]),
      });
    }
  }

  return Array.from(grouped.values()).sort(compareCouncilFindings);
}

function groupPriorities(
  directorAssessments: ExecutiveDirectorAssessment[],
): ExecutiveCouncilPriority[] {
  const grouped = new Map<string, ExecutiveCouncilPriority>();

  for (const director of directorAssessments) {
    for (const priority of director.priorities) {
      const groupKey = buildGroupKey(priority.title);
      const current = grouped.get(groupKey);

      if (!current) {
        grouped.set(groupKey, mapPriority(priority, director.id, groupKey));
        continue;
      }

      grouped.set(groupKey, {
        ...current,
        impact: highestImpact(current.impact, priority.impact),
        explanation: mergeText(current.explanation, priority.explanation),
        suggestedAction: mergeText(
          current.suggestedAction,
          priority.suggestedAction,
        ),
        evidenceRefs: uniqueStrings([...current.evidenceRefs, ...priority.evidenceRefs]),
        participantRefs: uniqueStrings([...current.participantRefs, director.id]),
      });
    }
  }

  return Array.from(grouped.values());
}

function groupRecommendations(
  directorAssessments: ExecutiveDirectorAssessment[],
): ExecutiveCouncilRecommendation[] {
  const grouped = new Map<string, ExecutiveCouncilRecommendation>();

  for (const director of directorAssessments) {
    for (const recommendation of director.recommendations) {
      const groupKey = buildGroupKey(recommendation.title);
      const current = grouped.get(groupKey);

      if (!current) {
        grouped.set(
          groupKey,
          mapRecommendation(recommendation, director.id, groupKey),
        );
        continue;
      }

      grouped.set(groupKey, {
        ...current,
        impact: highestImpact(current.impact, recommendation.impact),
        explanation: mergeText(current.explanation, recommendation.explanation),
        suggestedAction: mergeText(
          current.suggestedAction,
          recommendation.suggestedAction,
        ),
        evidenceRefs: uniqueStrings([
          ...current.evidenceRefs,
          ...recommendation.evidenceRefs,
        ]),
        participantRefs: uniqueStrings([...current.participantRefs, director.id]),
      });
    }
  }

  return Array.from(grouped.values());
}

function buildRisksFromFindings(
  findings: ExecutiveCouncilFinding[],
): ExecutiveCouncilRisk[] {
  return findings
    .filter((finding) => finding.severity !== "LOW")
    .map((finding) => ({
      id: `council-risk-${finding.id}`,
      severity: finding.severity,
      title: finding.title,
      explanation: finding.explanation,
      suggestedAction: "Resolve this council finding before increasing exposure.",
      evidenceRefs: finding.evidenceRefs,
      participantRefs: finding.participantRefs,
    }))
    .sort(compareCouncilRisks);
}

function buildOpportunitiesFromRecommendations(
  recommendations: ExecutiveCouncilRecommendation[],
): ExecutiveCouncilOpportunity[] {
  return recommendations
    .filter((recommendation) => recommendation.impact !== "LOW")
    .map((recommendation) => ({
      id: `council-opportunity-${recommendation.id}`,
      impact: recommendation.impact,
      title: recommendation.title,
      explanation: recommendation.explanation,
      suggestedAction: recommendation.suggestedAction,
      evidenceRefs: recommendation.evidenceRefs,
      participantRefs: recommendation.participantRefs,
    }))
    .sort(compareCouncilOpportunities);
}

function mapPriority(
  priority: ExecutiveDirectorPriority,
  participantId: string,
  groupKey: string,
): ExecutiveCouncilPriority {
  return {
    id: `council-priority-${groupKey}`,
    impact: priority.impact,
    title: priority.title,
    explanation: priority.explanation,
    suggestedAction: priority.suggestedAction,
    evidenceRefs: uniqueStrings(priority.evidenceRefs),
    participantRefs: [participantId],
  };
}

function mapRecommendation(
  recommendation: ExecutiveDirectorRecommendation,
  participantId: string,
  groupKey: string,
): ExecutiveCouncilRecommendation {
  return {
    id: `council-recommendation-${groupKey}`,
    impact: recommendation.impact,
    title: recommendation.title,
    explanation: recommendation.explanation,
    suggestedAction: recommendation.suggestedAction,
    evidenceRefs: uniqueStrings(recommendation.evidenceRefs),
    participantRefs: [participantId],
  };
}

function sortPriorities(
  priorities: ExecutiveCouncilPriority[],
): ExecutiveCouncilPriority[] {
  return [...priorities].sort((left, right) => {
    return (
      impactRank(right.impact) - impactRank(left.impact) ||
      left.title.localeCompare(right.title, "en")
    );
  });
}

function sortRecommendations(
  recommendations: ExecutiveCouncilRecommendation[],
): ExecutiveCouncilRecommendation[] {
  return [...recommendations].sort((left, right) => {
    return (
      impactRank(right.impact) - impactRank(left.impact) ||
      left.title.localeCompare(right.title, "en")
    );
  });
}

function compareCouncilFindings(
  left: ExecutiveCouncilFinding,
  right: ExecutiveCouncilFinding,
): number {
  return (
    severityRank(right.severity) - severityRank(left.severity) ||
    left.title.localeCompare(right.title, "en")
  );
}

function compareCouncilRisks(
  left: ExecutiveCouncilRisk,
  right: ExecutiveCouncilRisk,
): number {
  return (
    severityRank(right.severity) - severityRank(left.severity) ||
    left.title.localeCompare(right.title, "en")
  );
}

function compareCouncilOpportunities(
  left: ExecutiveCouncilOpportunity,
  right: ExecutiveCouncilOpportunity,
): number {
  return (
    impactRank(right.impact) - impactRank(left.impact) ||
    left.title.localeCompare(right.title, "en")
  );
}

function calculateCouncilConfidence(
  participants: ExecutiveCouncilParticipant[],
): number {
  if (participants.length === 0) {
    return 0.1;
  }

  const totalConfidence = participants.reduce(
    (sum, participant) => sum + participant.confidence,
    0,
  );

  return roundToTwoDecimals(totalConfidence / participants.length);
}

function buildExecutiveSummary(input: {
  participants: ExecutiveCouncilParticipant[];
  findings: ExecutiveCouncilFinding[];
  risks: ExecutiveCouncilRisk[];
  priorities: ExecutiveCouncilPriority[];
  recommendations: ExecutiveCouncilRecommendation[];
}): string {
  if (input.participants.length === 0) {
    return "Executive council has no participants yet.";
  }

  if (input.findings.length === 0) {
    return "Executive council found no deterministic management issue yet.";
  }

  const criticalRiskCount = input.risks.filter(
    (risk) => risk.severity === "CRITICAL" || risk.severity === "HIGH",
  ).length;
  const priorityCount = input.priorities.length;
  const recommendationCount = input.recommendations.length;

  return `Executive council produced ${input.findings.length} findings, ${criticalRiskCount} high-risk items, ${priorityCount} priorities, and ${recommendationCount} recommendations.`;
}

function worstSeverity(
  left: ExecutiveBrainSeverity,
  right: ExecutiveBrainSeverity,
): ExecutiveBrainSeverity {
  return severityRank(right) > severityRank(left) ? right : left;
}

function highestImpact(
  left: ExecutiveBrainImpact,
  right: ExecutiveBrainImpact,
): ExecutiveBrainImpact {
  return impactRank(right) > impactRank(left) ? right : left;
}

function severityRank(severity: ExecutiveBrainSeverity): number {
  const ranks: Record<ExecutiveBrainSeverity, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  return ranks[severity];
}

function impactRank(impact: ExecutiveBrainImpact): number {
  const ranks: Record<ExecutiveBrainImpact, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
  };

  return ranks[impact];
}

function buildGroupKey(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mergeText(left: string, right: string): string {
  if (normalizeText(left) === normalizeText(right)) {
    return left;
  }

  return `${left} ${right}`;
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
