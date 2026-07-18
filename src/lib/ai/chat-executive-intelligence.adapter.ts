import { buildExecutiveIntelligence } from "@/lib/executive-intelligence";
import { buildMemoryContextForOrganization } from "@/lib/memory/memory-context-builder.service";
import { recordShadowDuplicateClassification } from "@/lib/executive-request-resolution";
import type { ExecutiveIntelligenceResult } from "@/lib/executive-intelligence";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

export type ChatExecutiveIntelligenceDiagnosticContext = Readonly<{
  requestId: string;
  channel: "text" | "voice";
  upstreamUnderstandingAvailable: boolean;
}>;

export type ChatExecutiveIntelligenceInput = {
  organizationId: string;
  message: string;
  generatedAt: string;
  diagnosticContext?: ChatExecutiveIntelligenceDiagnosticContext;
};

export type ChatExecutiveIntelligenceDependencies = Readonly<{
  buildMemoryContext: (input: { organizationId: string }) => Promise<MemoryContext | null>;
  buildIntelligence: typeof buildExecutiveIntelligence;
  recordDuplicateClassification: typeof recordShadowDuplicateClassification;
}>;

const DEFAULT_DEPENDENCIES: ChatExecutiveIntelligenceDependencies = {
  buildMemoryContext: buildMemoryContextForOrganization,
  buildIntelligence: buildExecutiveIntelligence,
  recordDuplicateClassification: recordShadowDuplicateClassification,
};

export async function buildChatExecutiveIntelligence(
  input: ChatExecutiveIntelligenceInput,
  dependencies: ChatExecutiveIntelligenceDependencies = DEFAULT_DEPENDENCIES,
): Promise<ExecutiveIntelligenceResult | null> {
  try {
    const memoryContext = await dependencies.buildMemoryContext({
      organizationId: input.organizationId,
    });

    if (input.diagnosticContext) {
      try {
        dependencies.recordDuplicateClassification(input.diagnosticContext);
      } catch {
        // Shadow diagnostics never affect the existing intelligence fallback.
      }
    }

    // Architecture Note: buildIntelligence still classifies independently.
    // A later phase may pass upstream understanding through this adapter.
    return await dependencies.buildIntelligence({
      message: input.message,
      memoryContext,
      generatedAt: input.generatedAt,
    });
  } catch {
    return null;
  }
}
