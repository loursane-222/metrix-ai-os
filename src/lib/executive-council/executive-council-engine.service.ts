import type {
  DirectorOpinion,
  DirectorOpinionEvidence,
  DirectorType,
} from "@/lib/director-opinions";
import type {
  BuildExecutiveCouncilSynthesisInput,
  ExecutiveCouncilAction,
  ExecutiveCouncilConsensusItem,
  ExecutiveCouncilDisagreement,
  ExecutiveCouncilEvidence,
  ExecutiveCouncilPriorityConflict,
  ExecutiveCouncilQuestion,
  ExecutiveCouncilSynthesis,
  ExecutiveCouncilUrgency,
} from "./executive-council.types";
import {
  buildFallbackAction,
  buildRecommendedExecutiveStance,
  highestCouncilUrgency,
  isAtLeastUrgency,
  mapCouncilConfidence,
  mapCouncilUrgency,
  normalizeTopic,
  resolveCouncilConfidence,
  resolveCouncilPosition,
  sortActions,
  sortByUrgencyThenTitle,
  uniqueDirectorTypes,
  uniqueStrings,
} from "./executive-council-summary.service";

const VERSION = "v1" as const;
const MAX_ITEMS = 5;
const MAX_EVIDENCE = 8;

export function buildExecutiveCouncilSynthesis(
  input: BuildExecutiveCouncilSynthesisInput,
): ExecutiveCouncilSynthesis {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const opinions = input.directorOpinionBundle.opinions;

  if (opinions.length === 0) {
    const fallbackEvidence = buildInsufficientEvidence();
    const recommendedExecutiveStance = buildRecommendedExecutiveStance({
      position: "UNCERTAIN",
      highestUrgency: "WATCH",
      topConcern: null,
      hasPriorityConflict: false,
      hasLowConfidence: true,
    });

    return {
      councilPosition: "UNCERTAIN",
      consensusItems: [],
      disagreements: [],
      priorityConflicts: [],
      recommendedExecutiveStance,
      recommendedActions: [
        buildFallbackAction({
          position: "UNCERTAIN",
          sourceDirectorTypes: [],
        }),
      ],
      unresolvedQuestions: [{
        title: "Director opinions are missing",
        reason:
          "Executive Council cannot synthesize a board-like position without director opinions.",
        sourceDirectorTypes: [],
      }],
      evidence: [fallbackEvidence],
      confidence: "LOW",
      generatedAt,
      version: VERSION,
    };
  }

  const consensusItems = buildConsensusItems(opinions);
  const disagreements = buildDisagreements(opinions);
  const priorityConflicts = buildPriorityConflicts(opinions);
  const evidence = buildCouncilEvidence(opinions, input.directorOpinionBundle.crossFunctionalConflicts);
  const hasInsufficientData = opinions.some(
    (opinion) => opinion.confidence === "LOW" || isInsufficientEvidenceOpinion(opinion),
  );
  const councilPosition = resolveCouncilPosition({
    opinions,
    hasInsufficientData,
    disagreementsCount: disagreements.length,
    priorityConflictsCount: priorityConflicts.length,
  });
  const highestUrgency = highestCouncilUrgency([
    ...opinions.map((opinion) => mapCouncilUrgency(opinion.urgency)),
    ...priorityConflicts.map((conflict) => conflict.urgency),
    ...consensusItems.map((item) => item.urgency),
  ]);
  const topConcern =
    input.directorOpinionBundle.topConcerns[0] ??
    consensusItems[0]?.summary ??
    null;
  const recommendedExecutiveStance = buildRecommendedExecutiveStance({
    position: councilPosition,
    highestUrgency,
    topConcern,
    hasPriorityConflict: priorityConflicts.length > 0,
    hasLowConfidence: hasInsufficientData,
  });
  const recommendedActions = buildRecommendedActions(opinions, priorityConflicts, councilPosition);
  const unresolvedQuestions = buildUnresolvedQuestions(opinions, disagreements);
  const confidence = resolveCouncilConfidence({
    opinions,
    evidence,
    disagreementsCount: disagreements.length + priorityConflicts.length,
  });

  return {
    councilPosition,
    consensusItems,
    disagreements,
    priorityConflicts,
    recommendedExecutiveStance,
    recommendedActions,
    unresolvedQuestions,
    evidence,
    confidence,
    generatedAt,
    version: VERSION,
  };
}

function buildConsensusItems(
  opinions: DirectorOpinion[],
): ExecutiveCouncilConsensusItem[] {
  const groups = new Map<string, ConsensusGroup>();

  for (const opinion of opinions) {
    for (const risk of opinion.risks) {
      addConsensusGroup(groups, {
        topic: normalizeTopic(risk.title),
        title: risk.title,
        summary: risk.explanation,
        urgency: mapCouncilUrgency(risk.severity),
        directorType: opinion.directorType,
        evidenceRefs: evidenceRefs(opinion.evidence),
      });
    }

    for (const opportunity of opinion.opportunities) {
      addConsensusGroup(groups, {
        topic: normalizeTopic(opportunity.title),
        title: opportunity.title,
        summary: opportunity.explanation,
        urgency: opportunity.impact === "HIGH" ? "IMPORTANT" : "WATCH",
        directorType: opinion.directorType,
        evidenceRefs: evidenceRefs(opinion.evidence),
      });
    }

    for (const action of opinion.recommendedActions) {
      addConsensusGroup(groups, {
        topic: normalizeTopic(action.title),
        title: action.title,
        summary: action.rationale,
        urgency: mapCouncilUrgency(action.urgency),
        directorType: opinion.directorType,
        evidenceRefs: evidenceRefs(opinion.evidence),
      });
    }
  }

  return sortByUrgencyThenTitle(
    [...groups.values()]
      .filter((group) => group.directorTypes.length > 1)
      .map((group) => ({
        title: group.title,
        summary: group.summaries[0] ?? group.title,
        urgency: group.urgency,
        participantDirectorTypes: uniqueDirectorTypes(group.directorTypes),
        evidenceRefs: uniqueStrings(group.evidenceRefs),
      })),
  ).slice(0, MAX_ITEMS);
}

function buildDisagreements(
  opinions: DirectorOpinion[],
): ExecutiveCouncilDisagreement[] {
  const disagreements: ExecutiveCouncilDisagreement[] = [];
  const urgentOpinions = opinions.filter((opinion) => opinion.urgency === "URGENT");
  const lowUrgencyOpinions = opinions.filter((opinion) => opinion.urgency === "LOW");
  const lowConfidenceOpinions = opinions.filter((opinion) => opinion.confidence === "LOW");
  const highConfidenceUrgentOpinions = opinions.filter(
    (opinion) => opinion.urgency === "URGENT" && opinion.confidence === "HIGH",
  );

  if (urgentOpinions.length > 0 && lowUrgencyOpinions.length > 0) {
    disagreements.push({
      title: "Council urgency is not aligned",
      summary:
        "At least one director sees urgent pressure while another sees low urgency.",
      directorPositions: [...urgentOpinions, ...lowUrgencyOpinions].map(toDirectorPosition),
      severity: "IMPORTANT",
    });
  }

  if (highConfidenceUrgentOpinions.length > 0 && lowConfidenceOpinions.length > 0) {
    disagreements.push({
      title: "Urgent view depends on uneven evidence confidence",
      summary:
        "Council has urgent high-confidence pressure while at least one director has low-confidence evidence.",
      directorPositions: [...highConfidenceUrgentOpinions, ...lowConfidenceOpinions].map(toDirectorPosition),
      severity: "WATCH",
    });
  }

  return disagreements.slice(0, MAX_ITEMS);
}

function buildPriorityConflicts(
  opinions: DirectorOpinion[],
): ExecutiveCouncilPriorityConflict[] {
  const conflicts: ExecutiveCouncilPriorityConflict[] = [];
  const finance = findOpinion(opinions, "FINANCE_DIRECTOR");
  const sales = findOpinion(opinions, "SALES_DIRECTOR");
  const operations = findOpinion(opinions, "OPERATIONS_DIRECTOR");
  const strategy = findOpinion(opinions, "STRATEGY_DIRECTOR");
  const research = findOpinion(opinions, "RESEARCH_DIRECTOR");

  if (isAtLeastUrgency(mapCouncilUrgency(finance?.urgency ?? "LOW"), "IMPORTANT") && hasOpportunity(sales)) {
    conflicts.push({
      title: "Finance pressure conflicts with sales opportunity",
      summary:
        "Finance signals important or urgent pressure while sales sees active commercial opportunity.",
      affectedDirectorTypes: compactDirectorTypes([
        finance?.directorType,
        sales?.directorType,
      ]),
      urgency: finance?.urgency === "URGENT" ? "URGENT" : "IMPORTANT",
      recommendedResolution:
        "Prioritize cash-safe commercial action: pursue sales only with clear payment terms and financial exposure limits.",
    });
  }

  if (hasOpportunity(sales) && isAtLeastUrgency(mapCouncilUrgency(operations?.urgency ?? "LOW"), "IMPORTANT")) {
    conflicts.push({
      title: "Sales momentum conflicts with operations capacity",
      summary:
        "Sales opportunity is visible while operations reports important execution or capacity pressure.",
      affectedDirectorTypes: compactDirectorTypes([
        sales?.directorType,
        operations?.directorType,
      ]),
      urgency: operations?.urgency === "URGENT" ? "URGENT" : "IMPORTANT",
      recommendedResolution:
        "Sequence growth after execution capacity is clarified, or restrict new work to capacity-safe commitments.",
    });
  }

  if (isAtLeastUrgency(mapCouncilUrgency(research?.urgency ?? "LOW"), "IMPORTANT") && strategy?.confidence === "LOW") {
    conflicts.push({
      title: "External pressure conflicts with low strategic confidence",
      summary:
        "Research signals external pressure while strategy confidence is low.",
      affectedDirectorTypes: compactDirectorTypes([
        research?.directorType,
        strategy?.directorType,
      ]),
      urgency: research?.urgency === "URGENT" ? "URGENT" : "IMPORTANT",
      recommendedResolution:
        "Use external signals cautiously and clarify strategic evidence before committing to a major stance.",
    });
  }

  return sortByUrgencyThenTitle(conflicts).slice(0, MAX_ITEMS);
}

function buildRecommendedActions(
  opinions: DirectorOpinion[],
  priorityConflicts: ExecutiveCouncilPriorityConflict[],
  councilPosition: ExecutiveCouncilSynthesis["councilPosition"],
): ExecutiveCouncilAction[] {
  const actions: ExecutiveCouncilAction[] = [];

  for (const conflict of priorityConflicts) {
    actions.push({
      title: conflict.recommendedResolution,
      rationale: conflict.summary,
      urgency: conflict.urgency,
      sourceDirectorTypes: conflict.affectedDirectorTypes,
    });
  }

  const groupedActions = new Map<string, ExecutiveCouncilAction>();
  for (const opinion of opinions) {
    for (const action of opinion.recommendedActions) {
      const key = normalizeTopic(action.title);
      if (!key) continue;
      const current = groupedActions.get(key);
      if (!current) {
        groupedActions.set(key, {
          title: action.title,
          rationale: action.rationale,
          urgency: mapCouncilUrgency(action.urgency),
          sourceDirectorTypes: [opinion.directorType],
        });
        continue;
      }

      groupedActions.set(key, {
        ...current,
        urgency: highestCouncilUrgency([current.urgency, mapCouncilUrgency(action.urgency)]),
        sourceDirectorTypes: uniqueDirectorTypes([
          ...current.sourceDirectorTypes,
          opinion.directorType,
        ]),
      });
    }
  }

  actions.push(
    ...[...groupedActions.values()].filter(
      (action) =>
        action.sourceDirectorTypes.length > 1 ||
        isAtLeastUrgency(action.urgency, "IMPORTANT"),
    ),
  );

  const sorted = sortActions(actions).slice(0, MAX_ITEMS);
  if (sorted.length > 0) return sorted;

  return [
    buildFallbackAction({
      position: councilPosition,
      sourceDirectorTypes: opinions.map((opinion) => opinion.directorType),
    }),
  ];
}

function buildUnresolvedQuestions(
  opinions: DirectorOpinion[],
  disagreements: ExecutiveCouncilDisagreement[],
): ExecutiveCouncilQuestion[] {
  const questions: ExecutiveCouncilQuestion[] = [];
  const lowConfidenceOpinions = opinions.filter((opinion) => opinion.confidence === "LOW");

  for (const opinion of lowConfidenceOpinions.slice(0, MAX_ITEMS)) {
    questions.push({
      title: `Clarify evidence for ${opinion.opinionTitle}`,
      reason: opinion.executiveSummary,
      sourceDirectorTypes: [opinion.directorType],
    });
  }

  for (const disagreement of disagreements.slice(0, MAX_ITEMS - questions.length)) {
    questions.push({
      title: `Resolve disagreement: ${disagreement.title}`,
      reason: disagreement.summary,
      sourceDirectorTypes: uniqueDirectorTypes(
        disagreement.directorPositions.map((position) => position.directorType),
      ),
    });
  }

  return questions.slice(0, MAX_ITEMS);
}

function buildCouncilEvidence(
  opinions: DirectorOpinion[],
  crossFunctionalConflicts: string[],
): ExecutiveCouncilEvidence[] {
  const evidence: ExecutiveCouncilEvidence[] = [];

  for (const opinion of opinions) {
    evidence.push({
      sourceDirectorTypes: [opinion.directorType],
      label: opinion.opinionTitle,
      value: `${opinion.urgency} / ${opinion.confidence}`,
      sourceEvidence: opinion.evidence.slice(0, 2),
    });
    if (evidence.length >= MAX_EVIDENCE) return evidence;
  }

  for (const conflict of crossFunctionalConflicts) {
    evidence.push({
      sourceDirectorTypes: opinions.map((opinion) => opinion.directorType),
      label: "Cross-functional conflict",
      value: conflict,
      sourceEvidence: [],
    });
    if (evidence.length >= MAX_EVIDENCE) return evidence;
  }

  return evidence.length > 0 ? evidence : [buildInsufficientEvidence()];
}

function buildInsufficientEvidence(): ExecutiveCouncilEvidence {
  return {
    sourceDirectorTypes: [],
    label: "Evidence",
    value: "Insufficient director opinions were available for council synthesis.",
    sourceEvidence: [],
  };
}

function addConsensusGroup(
  groups: Map<string, ConsensusGroup>,
  input: {
    topic: string;
    title: string;
    summary: string;
    urgency: ExecutiveCouncilUrgency;
    directorType: DirectorType;
    evidenceRefs: string[];
  },
): void {
  if (!input.topic) return;
  const current = groups.get(input.topic);
  if (!current) {
    groups.set(input.topic, {
      title: input.title,
      summaries: [input.summary],
      urgency: input.urgency,
      directorTypes: [input.directorType],
      evidenceRefs: input.evidenceRefs,
    });
    return;
  }

  groups.set(input.topic, {
    ...current,
    summaries: uniqueStrings([...current.summaries, input.summary]),
    urgency: highestCouncilUrgency([current.urgency, input.urgency]),
    directorTypes: uniqueDirectorTypes([...current.directorTypes, input.directorType]),
    evidenceRefs: uniqueStrings([...current.evidenceRefs, ...input.evidenceRefs]),
  });
}

function toDirectorPosition(opinion: DirectorOpinion): {
  directorType: DirectorType;
  urgency: ExecutiveCouncilUrgency;
  confidence: ReturnType<typeof mapCouncilConfidence>;
  summary: string;
} {
  return {
    directorType: opinion.directorType,
    urgency: mapCouncilUrgency(opinion.urgency),
    confidence: mapCouncilConfidence(opinion.confidence),
    summary: opinion.executiveSummary,
  };
}

function findOpinion(
  opinions: DirectorOpinion[],
  directorType: DirectorType,
): DirectorOpinion | null {
  return opinions.find((opinion) => opinion.directorType === directorType) ?? null;
}

function hasOpportunity(opinion: DirectorOpinion | null): boolean {
  return Boolean(opinion && opinion.opportunities.length > 0);
}

function compactDirectorTypes(
  values: Array<DirectorType | undefined>,
): DirectorType[] {
  return uniqueDirectorTypes(values.filter((value): value is DirectorType => Boolean(value)));
}

function isInsufficientEvidenceOpinion(opinion: DirectorOpinion): boolean {
  return opinion.evidence.some(
    (item) =>
      item.source === "data_quality" &&
      item.value.toLocaleLowerCase("en").includes("insufficient"),
  );
}

function evidenceRefs(evidence: DirectorOpinionEvidence[]): string[] {
  return evidence.map((item) => `${item.source}:${item.label}:${item.value}`);
}

type ConsensusGroup = {
  title: string;
  summaries: string[];
  urgency: ExecutiveCouncilUrgency;
  directorTypes: DirectorType[];
  evidenceRefs: string[];
};
