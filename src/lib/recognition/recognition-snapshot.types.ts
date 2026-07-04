export const RECOGNITION_SNAPSHOT_FIELDS = [
  "team_size",
  "strategic_focus",
  "industry",
  "city",
  "primary_customer_type",
  "top_goal",
] as const;

export type RecognitionSnapshotField =
  (typeof RECOGNITION_SNAPSHOT_FIELDS)[number];

export type RecognitionMemoryKey =
  | RecognitionSnapshotField
  | "cashflow_priority"
  | "profitability_focus"
  | "personal_preference"
  | "personal_interest"
  | "family_member"
  | "family_important_date"
  | "lifestyle_preference"
  | "favorite_team"
  | "hobby"
  | "music_preference"
  | "work_preference"
  | "stress_behavior"
  | "calendar_preference"
  | "unavailable_pattern"
  | "decision_preference"
  | "communication_preference";

export const RECOGNITION_DOMAINS = [
  "BUSINESS",
  "TEAM",
  "GOALS",
  "CUSTOMERS",
  "FINANCE",
  "PERSONAL",
  "FAMILY",
  "LIFESTYLE",
  "INTERESTS",
  "WORKING_STYLE",
  "CALENDAR_BEHAVIOR",
  "DECISION_STYLE",
  "COMMUNICATION_STYLE",
] as const;

export type RecognitionDomain = (typeof RECOGNITION_DOMAINS)[number];

export type RecognitionDomainCoverageStatus =
  | "UNKNOWN"
  | "PARTIAL"
  | "KNOWN";

export type RecognitionDomainCoverage = {
  domain: RecognitionDomain;
  knownKeys: string[];
  unknownKeys: string[];
  status: RecognitionDomainCoverageStatus;
};

export type RecognitionSnapshotKnownField = {
  field: RecognitionSnapshotField;
  memoryItemId: string;
  value: string;
  updatedAt: string;
};

export type RecognitionSnapshot = {
  version: "v1";
  generatedAt: string;
  organizationId: string;
  known: RecognitionSnapshotKnownField[];
  unknown: RecognitionSnapshotField[];
  domainCoverage?: RecognitionDomainCoverage[];
};

export type BuildRecognitionSnapshotInput = {
  organizationId: string;
};

export type RecognitionOpportunityPriority = "HIGH" | "MEDIUM" | "LOW";

export type RecognitionOpportunity = {
  key: RecognitionMemoryKey;
  priority: RecognitionOpportunityPriority;
  reason: string;
  suggestedQuestion: string;
};
