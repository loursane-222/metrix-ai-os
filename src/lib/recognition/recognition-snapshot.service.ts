import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";

import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type {
  BuildRecognitionSnapshotInput,
  RecognitionDomain,
  RecognitionDomainCoverage,
  RecognitionDomainCoverageStatus,
  RecognitionSnapshot,
  RecognitionSnapshotField,
  RecognitionSnapshotKnownField,
} from "./recognition-snapshot.types";
import {
  RECOGNITION_DOMAINS,
  RECOGNITION_SNAPSHOT_FIELDS,
} from "./recognition-snapshot.types";

const DOMAIN_EXPECTED_KEYS: Record<RecognitionDomain, string[]> = {
  BUSINESS: ["industry", "city", "strategic_focus"],
  TEAM: ["team_size"],
  GOALS: ["top_goal", "strategic_focus"],
  CUSTOMERS: ["primary_customer_type"],
  FINANCE: ["cashflow_priority", "profitability_focus"],
  PERSONAL: ["personal_preference", "personal_interest"],
  FAMILY: ["family_member", "family_important_date"],
  LIFESTYLE: ["lifestyle_preference"],
  INTERESTS: ["favorite_team", "hobby", "music_preference"],
  WORKING_STYLE: ["work_preference", "stress_behavior"],
  CALENDAR_BEHAVIOR: ["calendar_preference", "unavailable_pattern"],
  DECISION_STYLE: ["decision_preference"],
  COMMUNICATION_STYLE: ["communication_preference"],
};

export async function buildRecognitionSnapshot(
  input: BuildRecognitionSnapshotInput,
): Promise<RecognitionSnapshot> {
  assertNonEmpty(input.organizationId, "organizationId");

  const activeMemoryItems = await listActiveMemoryItemsByOrganization(
    input.organizationId,
  );
  const known = buildKnownFields(activeMemoryItems);
  const knownFieldNames = new Set(known.map((item) => item.field));
  const activeMemoryKeys = new Set(
    activeMemoryItems.map((memoryItem) => normalizeValue(memoryItem.key)),
  );

  return {
    version: "v1",
    generatedAt: new Date().toISOString(),
    organizationId: input.organizationId,
    known,
    unknown: RECOGNITION_SNAPSHOT_FIELDS.filter(
      (field) => !knownFieldNames.has(field),
    ),
    domainCoverage: buildDomainCoverage(activeMemoryKeys),
  };
}

function buildDomainCoverage(
  activeMemoryKeys: Set<string>,
): RecognitionDomainCoverage[] {
  return RECOGNITION_DOMAINS.map((domain) => {
    const expectedKeys = DOMAIN_EXPECTED_KEYS[domain];
    const knownKeys = expectedKeys.filter((key) =>
      activeMemoryKeys.has(normalizeValue(key)),
    );
    const unknownKeys = expectedKeys.filter(
      (key) => !activeMemoryKeys.has(normalizeValue(key)),
    );

    return {
      domain,
      knownKeys,
      unknownKeys,
      status: getDomainCoverageStatus({ knownKeys, unknownKeys }),
    };
  });
}

function getDomainCoverageStatus(input: {
  knownKeys: string[];
  unknownKeys: string[];
}): RecognitionDomainCoverageStatus {
  if (input.knownKeys.length === 0) {
    return "UNKNOWN";
  }

  if (input.unknownKeys.length === 0) {
    return "KNOWN";
  }

  return "PARTIAL";
}

function buildKnownFields(
  memoryItems: MemoryItemResult[],
): RecognitionSnapshotKnownField[] {
  const latestByField = new Map<
    RecognitionSnapshotField,
    RecognitionSnapshotKnownField
  >();

  for (const memoryItem of memoryItems) {
    const field = toRecognitionSnapshotField(memoryItem.key);

    if (!field) {
      continue;
    }

    const knownField = {
      field,
      memoryItemId: memoryItem.id,
      value: memoryItem.value,
      updatedAt: memoryItem.updatedAt.toISOString(),
    };
    const current = latestByField.get(field);

    if (
      !current ||
      Date.parse(knownField.updatedAt) > Date.parse(current.updatedAt)
    ) {
      latestByField.set(field, knownField);
    }
  }

  return RECOGNITION_SNAPSHOT_FIELDS.flatMap((field) => {
    const knownField = latestByField.get(field);

    return knownField ? [knownField] : [];
  });
}

function toRecognitionSnapshotField(
  value: string,
): RecognitionSnapshotField | null {
  const normalizedValue = normalizeValue(value);

  return (
    RECOGNITION_SNAPSHOT_FIELDS.find(
      (field) => normalizeValue(field) === normalizedValue,
    ) ?? null
  );
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
