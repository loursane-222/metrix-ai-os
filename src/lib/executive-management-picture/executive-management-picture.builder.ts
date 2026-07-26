import { buildExecutiveBrainContext } from "@/lib/executive-brain/executive-brain-context-builder.service";
import type {
  ExecutiveBrainContext,
  ExecutiveBrainSourceReliability,
} from "@/lib/executive-brain/executive-brain.types";
import type {
  BuildExecutiveManagementPictureV1Input,
  ExecutiveManagementPictureV1,
} from "./executive-management-picture.contracts";

const REQUIRED_SOURCES = ["organization", "memory", "people", "events"] as const;

export async function buildExecutiveManagementPictureV1(
  input: BuildExecutiveManagementPictureV1Input,
  onAdapterTiming?: Parameters<typeof buildExecutiveBrainContext>[1],
): Promise<ExecutiveManagementPictureV1> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const context = await buildExecutiveBrainContext({
    organizationId: input.organizationId,
    now: generatedAt,
    preloadedOrganization: input.preloadedOrganization,
    preloadedMemoryItems: input.preloadedMemoryItems,
  }, onAdapterTiming);
  return createPicture(input, generatedAt, context);
}

function createPicture(
  input: BuildExecutiveManagementPictureV1Input,
  generatedAt: string,
  context: ExecutiveBrainContext,
): ExecutiveManagementPictureV1 {
  const reliability = context.sourceReliability ?? [];
  const missingRequiredSources = REQUIRED_SOURCES.filter((source) =>
    !reliability.some((item) =>
      item.source === source
      && item.connected
      && item.signalCount > 0,
    ),
  );
  const evidenceGaps = reliability
    .filter((item) => !item.connected || item.signalCount === 0)
    .map((item) => item.source);
  const byDomain = Object.fromEntries(reliability.map((item) => [
    item.source,
    reliabilityConfidence(item),
  ]));
  const confidenceValues = Object.values(byDomain);
  const overall = confidenceValues.length === 0
    ? 0
    : confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;

  return deepFreeze({
    schemaVersion: "executive-management-picture.v1",
    pictureId: `executive-picture:${input.conversationId ?? input.organizationId}:${input.requestId ?? generatedAt}`,
    organizationId: input.organizationId,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    generatedAt,
    conversation: {
      understanding: input.understanding,
      currentTurn: {
        messagePresent: input.messagePresent,
        channel: input.channel,
      },
    },
    managementReality: {
      ownerSignals: context.ownerSignals ?? [],
      companySignals: context.companySignals ?? [],
      customerSignals: context.customerSignals ?? [],
      personnelSignals: context.personnelSignals ?? [],
      salesSignals: context.salesSignals ?? [],
      financeSignals: context.financeSignals ?? [],
      operationsSignals: context.operationsSignals ?? [],
      memorySignals: context.memorySignals ?? [],
    },
    evidence: {
      sourceReliability: reliability,
      evidenceGaps,
    },
    time: { now: generatedAt },
    readiness: {
      assessmentReady: missingRequiredSources.length === 0,
      missingRequiredSources,
    },
    confidence: { overall, byDomain },
  });
}

function reliabilityConfidence(item: ExecutiveBrainSourceReliability): number {
  return item.connected ? Math.max(0, Math.min(1, item.confidence)) : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
