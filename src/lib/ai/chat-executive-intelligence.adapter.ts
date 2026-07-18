import { buildExecutiveIntelligence } from "@/lib/executive-intelligence";
import { buildMemoryContextForOrganization } from "@/lib/memory/memory-context-builder.service";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveIntelligenceResult } from "@/lib/executive-intelligence";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

export type ChatExecutiveIntelligenceInput = {
  organizationId: string;
  message: string;
  generatedAt: string;
  understanding: ConversationUnderstanding;
};

export type ChatExecutiveIntelligenceDependencies = Readonly<{
  buildMemoryContext: (input: { organizationId: string }) => Promise<MemoryContext | null>;
  buildIntelligence: typeof buildExecutiveIntelligence;
}>;

const DEFAULT_DEPENDENCIES: ChatExecutiveIntelligenceDependencies = {
  buildMemoryContext: buildMemoryContextForOrganization,
  buildIntelligence: buildExecutiveIntelligence,
};

export async function buildChatExecutiveIntelligence(
  input: ChatExecutiveIntelligenceInput,
  dependencies: ChatExecutiveIntelligenceDependencies = DEFAULT_DEPENDENCIES,
): Promise<ExecutiveIntelligenceResult | null> {
  try {
    const memoryContext = await dependencies.buildMemoryContext({
      organizationId: input.organizationId,
    });

    return await dependencies.buildIntelligence({
      message: input.message,
      memoryContext,
      generatedAt: input.generatedAt,
      understanding: input.understanding,
    });
  } catch {
    return null;
  }
}
