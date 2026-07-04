import { buildExecutiveIntelligence } from "@/lib/executive-intelligence";
import { buildMemoryContextForOrganization } from "@/lib/memory/memory-context-builder.service";
import type { ExecutiveIntelligenceResult } from "@/lib/executive-intelligence";

export type ChatExecutiveIntelligenceInput = {
  organizationId: string;
  message: string;
  generatedAt: string;
};

export async function buildChatExecutiveIntelligence(
  input: ChatExecutiveIntelligenceInput,
): Promise<ExecutiveIntelligenceResult | null> {
  try {
    const memoryContext = await buildMemoryContextForOrganization({
      organizationId: input.organizationId,
    });
    return await buildExecutiveIntelligence({
      message: input.message,
      memoryContext,
      generatedAt: input.generatedAt,
    });
  } catch {
    return null;
  }
}
