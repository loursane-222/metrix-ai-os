import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type {
  ExecutiveBrainSignal,
  ExecutiveBrainSourceReliability,
} from "@/lib/executive-brain/executive-brain.types";

export type ExecutiveManagementPictureSignalV1 = Readonly<ExecutiveBrainSignal>;
export type ExecutiveManagementPictureSourceReliabilityV1 =
  Readonly<ExecutiveBrainSourceReliability>;

export type ExecutiveManagementPictureV1 = Readonly<{
  schemaVersion: "executive-management-picture.v1";
  pictureId: string;
  organizationId: string;
  conversationId?: string;
  requestId?: string;
  generatedAt: string;
  conversation: Readonly<{
    understanding: Readonly<ConversationUnderstanding>;
    currentTurn: Readonly<{
      messagePresent: boolean;
      channel: "text" | "voice";
    }>;
  }>;
  managementReality: Readonly<{
    ownerSignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
    companySignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
    customerSignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
    personnelSignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
    salesSignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
    financeSignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
    operationsSignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
    memorySignals: ReadonlyArray<ExecutiveManagementPictureSignalV1>;
  }>;
  evidence: Readonly<{
    sourceReliability: ReadonlyArray<ExecutiveManagementPictureSourceReliabilityV1>;
    evidenceGaps: ReadonlyArray<string>;
  }>;
  time: Readonly<{ now: string }>;
  readiness: Readonly<{
    assessmentReady: boolean;
    missingRequiredSources: ReadonlyArray<string>;
  }>;
  confidence: Readonly<{
    overall: number;
    byDomain: Readonly<Record<string, number>>;
  }>;
}>;

export type BuildExecutiveManagementPictureV1Input = Readonly<{
  organizationId: string;
  conversationId?: string;
  requestId?: string;
  generatedAt?: string;
  understanding: ConversationUnderstanding;
  channel: "text" | "voice";
  messagePresent: boolean;
  preloadedOrganization?: import("@prisma/client").Organization;
  preloadedMemoryItems?: import("@/lib/core/memory-items/memory-item.types").MemoryItemResult[];
}>;
