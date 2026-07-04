import type {
  DirectorOpinionProfile,
  DirectorType,
} from "./director-opinion.types";

const DIRECTOR_OPINION_PROFILES: DirectorOpinionProfile[] = [
  {
    directorType: "FINANCE_DIRECTOR",
    title: "Finance Director",
    domain: "finance",
    mission:
      "Read cash, collection, receivable, margin, and financial exposure signals.",
    signalSources: [
      "payment_context",
      "payment_intelligence",
      "forecast",
      "alert",
      "scorecard",
    ],
    riskLens: [
      "cash pressure",
      "collection delay",
      "new work over unpaid balance",
      "financial data quality",
    ],
    opportunityLens: [
      "better payment terms",
      "faster collection path",
      "cash visibility",
      "margin protection",
    ],
  },
  {
    directorType: "SALES_DIRECTOR",
    title: "Sales Director",
    domain: "sales",
    mission:
      "Read pipeline, quote quality, conversion, customer demand, and commercial momentum signals.",
    signalSources: [
      "quote_context",
      "quote_intelligence",
      "forecast",
      "alert",
      "scorecard",
    ],
    riskLens: [
      "stale quote",
      "weak conversion",
      "pipeline quality",
      "commercial follow-up gap",
    ],
    opportunityLens: [
      "hot quote follow-up",
      "better offer packaging",
      "conversion discipline",
      "pipeline prioritization",
    ],
  },
  {
    directorType: "OPERATIONS_DIRECTOR",
    title: "Operations Director",
    domain: "operations",
    mission:
      "Read delivery, ownership, capacity, action aging, and execution reliability signals.",
    signalSources: [
      "collection_action",
      "forecast",
      "alert",
      "decision",
      "scorecard",
    ],
    riskLens: [
      "execution gap",
      "stale action",
      "unclear ownership",
      "capacity pressure",
    ],
    opportunityLens: [
      "clear ownership",
      "shorter execution loop",
      "bottleneck removal",
      "delivery reliability",
    ],
  },
  {
    directorType: "STRATEGY_DIRECTOR",
    title: "Strategy Director",
    domain: "strategy",
    mission:
      "Read company posture, cross-functional tradeoffs, market exposure, and decision discipline.",
    signalSources: [
      "awareness",
      "scorecard",
      "narrative",
      "decision",
      "signal_trend",
    ],
    riskLens: [
      "strategic drift",
      "decision backlog",
      "risk momentum",
      "cross-functional conflict",
    ],
    opportunityLens: [
      "clearer executive focus",
      "better tradeoff resolution",
      "stronger operating rhythm",
      "strategic attention discipline",
    ],
  },
  {
    directorType: "RESEARCH_DIRECTOR",
    title: "Research Director",
    domain: "research",
    mission:
      "Read market briefing, macro signals, external risks, and source confidence.",
    signalSources: [
      "briefing",
      "forecast",
      "alert",
      "scorecard",
      "data_quality",
    ],
    riskLens: [
      "market pressure",
      "currency exposure",
      "external uncertainty",
      "low source confidence",
    ],
    opportunityLens: [
      "market timing",
      "external signal monitoring",
      "source-backed decision context",
      "macro awareness",
    ],
  },
];

export function listDirectorOpinionProfiles(): DirectorOpinionProfile[] {
  return DIRECTOR_OPINION_PROFILES.map(cloneProfile);
}

export function getDirectorOpinionProfile(
  directorType: DirectorType,
): DirectorOpinionProfile | null {
  const profile =
    DIRECTOR_OPINION_PROFILES.find((item) => item.directorType === directorType) ??
    null;

  return profile ? cloneProfile(profile) : null;
}

export function isDirectorType(value: string): value is DirectorType {
  return DIRECTOR_OPINION_PROFILES.some((item) => item.directorType === value);
}

function cloneProfile(profile: DirectorOpinionProfile): DirectorOpinionProfile {
  return {
    ...profile,
    signalSources: [...profile.signalSources],
    riskLens: [...profile.riskLens],
    opportunityLens: [...profile.opportunityLens],
  };
}
