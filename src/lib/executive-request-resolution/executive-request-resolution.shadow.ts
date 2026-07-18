import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

import type { CapabilityProviderRegistry } from "./capability-provider-registry";
import { resolveCapabilityAuthority } from "./capability-authority";
import type { ResolutionConfidence } from "./entity-resolution.types";
import type {
  ExecutiveRequestResolution,
  ExecutiveRequestResolver,
  PrimaryResolvedCapability,
  RequiredContext,
  ResolveExecutiveRequestInput,
} from "./executive-request-resolution.types";

const CONFIDENCE_SCORE = { low: 0.25, medium: 0.6, high: 0.9 } as const;

export class ShadowExecutiveRequestResolver implements ExecutiveRequestResolver<ConversationUnderstanding> {
  constructor(private readonly registry: CapabilityProviderRegistry) {}

  async resolve(
    input: ResolveExecutiveRequestInput<ConversationUnderstanding>,
  ): Promise<ExecutiveRequestResolution<ConversationUnderstanding>> {
    const { understanding } = input;
    const confidence = toConfidence(understanding);
    const base = {
      confidence,
      sourceUnderstanding: understanding,
      entities: [],
      requiredContexts: [],
      missingInformation: [],
    } as const;

    if (
      understanding.shouldAskClarification
      || understanding.confidence === "low"
      || understanding.suggestedHandling === "ask_clarification"
    ) {
      return {
        ...base,
        status: "CLARIFICATION_REQUIRED",
        intent: { name: "clarification", summary: "Upstream understanding requires clarification." },
        capabilities: [],
        executionStrategy: null,
        executionMode: "CLARIFICATION",
        capabilityAuthority: { outcome: "NOT_APPLICABLE", reason: "AMBIGUOUS" },
        missingInformation: [{
          key: "request-clarification",
          description: "Upstream understanding reported blocking ambiguity.",
          blocking: true,
          source: "conversation-understanding",
          reason: "AMBIGUOUS",
        }],
      };
    }

    // Mutation intent is observed but never activated in shadow mode.
    if (understanding.actionExpectation === "explicit" || understanding.userMotivation === "kayit_islem") {
      return {
        ...base,
        status: "NO_MATCH",
        intent: { name: "non-executable-request", summary: "Mutation intent is not executable in shadow mode." },
        capabilities: [],
        executionStrategy: null,
        executionMode: "DEFERRED",
        capabilityAuthority: { outcome: "NON_EXECUTABLE", reason: "SHADOW_DISABLED" },
        missingInformation: [{
          key: "shadow-mutation-disabled",
          description: "Mutation capability resolution is disabled during shadow integration.",
          blocking: false,
          source: "shadow-policy",
          reason: "UNAVAILABLE",
        }],
      };
    }

    if (understanding.conversationKind === "general_chat" && understanding.companyRelevance === "none") {
      return this.resolved(
        input,
        "conversation.general-answer",
        "general-answer",
        "ANSWER",
        "RESPONSE_ONLY",
      );
    }

    if (
      understanding.userMotivation === "bilgi_almak"
      && understanding.actionExpectation === "none"
      && (understanding.companyRelevance === "medium" || understanding.companyRelevance === "high")
    ) {
      return this.resolved(
        input,
        "company.context-read",
        "company-context-read",
        "READ",
        "READ_ONLY",
      );
    }

    if (
      understanding.userMotivation === "karar_destegi"
      || understanding.suggestedHandling === "executive_reasoning"
    ) {
      return this.resolved(
        input,
        "executive.analyze",
        "executive-analysis",
        "ANALYZE",
        "READ_ONLY",
      );
    }

    return {
      ...base,
      status: "NO_MATCH",
      intent: null,
      capabilities: [],
      executionStrategy: null,
      executionMode: "RESPONSE_ONLY",
      capabilityAuthority: { outcome: "NOT_APPLICABLE", reason: "NO_CAPABILITY_SIGNAL" },
    };
  }

  private resolved(
    input: ResolveExecutiveRequestInput<ConversationUnderstanding>,
    capabilityId: string,
    intentName: string,
    executionStrategy: "ANSWER" | "READ" | "ANALYZE",
    executionMode: "RESPONSE_ONLY" | "READ_ONLY",
  ): ExecutiveRequestResolution<ConversationUnderstanding> {
    const authority = resolveCapabilityAuthority({
      registry: this.registry,
      capabilityId,
      strategy: executionStrategy,
      mode: executionMode,
    });

    if (authority.outcome !== "AUTHORITATIVE") {
      return {
        status: "NO_MATCH",
        intent: null,
        confidence: toConfidence(input.understanding),
        sourceUnderstanding: input.understanding,
        capabilities: [],
        entities: [],
        requiredContexts: [],
        executionStrategy: null,
        executionMode: "DEFERRED",
        missingInformation: [{
          key: `capability-authority-${authority.reason.toLowerCase()}`,
          description: `Capability authority rejected ${capabilityId}.`,
          blocking: false,
          source: "capability-registry",
          reason: authority.reason === "UNAVAILABLE" ? "UNAVAILABLE" : authority.reason,
          blockedCapabilityId: capabilityId,
        }],
        capabilityAuthority: {
          outcome: authority.outcome,
          reason: authority.reason,
          capabilityId,
          providerId: authority.provider?.providerId,
        },
      };
    }

    const { provider, descriptor } = authority;

    const confidence = toConfidence(input.understanding);
    const primary: PrimaryResolvedCapability = {
      role: "PRIMARY",
      capabilityId,
      providerId: provider.providerId,
      confidence,
      evidence: [{
        evidenceType: "UNDERSTANDING_SIGNAL",
        source: "conversation-understanding",
        reference: intentName,
        confidence,
        providerId: provider.providerId,
      }],
    };

    return {
      status: "RESOLVED",
      intent: { name: intentName, summary: descriptor.businessOutcome },
      confidence,
      sourceUnderstanding: input.understanding,
      capabilities: [primary],
      entities: [],
      requiredContexts: descriptor.requiredContextIds.map(
        (contextId): RequiredContext => ({
          contextId,
          contextType: contextId,
          necessity: "REQUIRED",
          reason: `Required by ${capabilityId}.`,
          freshness: { maxAgeMs: null },
          sourceExpectations: ["ORGANIZATION_DATA"],
          contractVersion: descriptor.version,
        }),
      ),
      executionStrategy,
      executionMode,
      missingInformation: [],
      capabilityAuthority: {
        outcome: "AUTHORITATIVE",
        reason: "AUTHORIZED",
        capabilityId,
        providerId: provider.providerId,
      },
    };
  }
}

function toConfidence(understanding: ConversationUnderstanding): ResolutionConfidence {
  return {
    level: understanding.confidence,
    score: CONFIDENCE_SCORE[understanding.confidence],
  };
}
