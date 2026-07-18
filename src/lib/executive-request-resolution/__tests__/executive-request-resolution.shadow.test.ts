import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import * as requestResolutionApi from "..";

import {
  ExecutiveRequestResolutionValidationError,
  createShadowCapabilityProviderRegistry,
  createShadowExecutiveRequestResolver,
  isExecutableBinding,
  observeShadowExecutiveRequestResolution,
  recordShadowDuplicateClassification,
  recordShadowFastPathSkip,
  resolveExecutiveRequest,
} from "..";
import type { ExecutiveRequestResolver, ShadowDiagnosticLogger } from "..";

function understanding(
  overrides: Partial<ConversationUnderstanding> = {},
): ConversationUnderstanding {
  return {
    conversationKind: "general_chat",
    userMotivation: "sohbet_etmek",
    companyRelevance: "none",
    actionExpectation: "none",
    confidence: "high",
    shouldAskClarification: false,
    shouldInvokeExecutiveBrain: false,
    suggestedHandling: "answer_only",
    reasoning: {
      summary: "Safe test understanding.",
      observations: [],
      uncertainty: [],
      whyThisHandling: "Deterministic fixture.",
    },
    ...overrides,
  };
}

describe("ShadowExecutiveRequestResolver", () => {
  it("uses upstream understanding without classifying again", async () => {
    const source = readFileSync(
      new URL("../executive-request-resolution.shadow.ts", import.meta.url),
      "utf8",
    );
    const upstream = understanding();
    const resolver = createShadowExecutiveRequestResolver();

    const result = await resolveExecutiveRequest(
      { requestId: "req-1", organizationId: "org-1", understanding: upstream },
      resolver,
    );

    expect(source).not.toContain("classifyConversation");
    expect(result.sourceUnderstanding).toBe(upstream);
  });

  it("resolves general conversation to safe ANSWER/RESPONSE_ONLY metadata", async () => {
    const result = await createShadowExecutiveRequestResolver().resolve({
      requestId: "req-2",
      organizationId: "org-1",
      understanding: understanding(),
    });

    expect(result.status).toBe("RESOLVED");
    expect(result.executionStrategy).toBe("ANSWER");
    expect(result.executionMode).toBe("RESPONSE_ONLY");
  });

  it("resolves executive decision support to ANALYZE/READ_ONLY metadata", async () => {
    const result = await createShadowExecutiveRequestResolver().resolve({
      requestId: "req-3",
      organizationId: "org-1",
      understanding: understanding({
        conversationKind: "company_related",
        userMotivation: "karar_destegi",
        companyRelevance: "high",
        shouldInvokeExecutiveBrain: true,
        suggestedHandling: "executive_reasoning",
      }),
    });

    expect(result.status).toBe("RESOLVED");
    expect(result.executionStrategy).toBe("ANALYZE");
    expect(result.executionMode).toBe("READ_ONLY");
  });

  it("resolves company context reads without executable mode", async () => {
    const result = await createShadowExecutiveRequestResolver().resolve({
      requestId: "req-4",
      organizationId: "org-1",
      understanding: understanding({
        conversationKind: "company_related",
        userMotivation: "bilgi_almak",
        companyRelevance: "medium",
      }),
    });

    expect(result.executionStrategy).toBe("READ");
    expect(result.executionMode).toBe("READ_ONLY");
  });

  it("never activates explicit mutation intent", async () => {
    const result = await createShadowExecutiveRequestResolver().resolve({
      requestId: "req-5",
      organizationId: "org-1",
      understanding: understanding({
        conversationKind: "company_related",
        userMotivation: "kayit_islem",
        companyRelevance: "high",
        actionExpectation: "explicit",
        shouldInvokeExecutiveBrain: true,
        suggestedHandling: "executive_reasoning",
      }),
    });

    expect(result.status).toBe("NO_MATCH");
    expect(result.executionStrategy).toBeNull();
    expect(result.executionMode).not.toBe("EXECUTE");
  });

  it("keeps the handler-less customer surface capability non-executable", () => {
    const registry = createShadowCapabilityProviderRegistry();
    const provider = registry.getProvider("customer-surface-provider");
    const capability = provider?.getCapability("customer.surface-candidate");

    expect(provider?.availability).toBe("DECLARED_NOT_EXECUTABLE");
    expect(capability?.availability).toBe("DECLARED_NOT_EXECUTABLE");
    expect(capability?.executionBindings.every(isExecutableBinding)).toBe(false);
  });
});

describe("shadow diagnostics", () => {
  it("returns diagnostics only and does not expose a routing or response decision", async () => {
    const diagnostic = await observeShadowExecutiveRequestResolution({
      requestId: "req-6",
      channel: "text",
      organizationId: "org-1",
      understanding: understanding(),
      resolver: createShadowExecutiveRequestResolver(),
      log: vi.fn(),
    });

    expect(diagnostic.outcome).toBe("success");
    expect(diagnostic).not.toHaveProperty("resolution");
    expect(diagnostic).not.toHaveProperty("response");
    expect(diagnostic).not.toHaveProperty("routingDecision");
  });

  it("contains no user message or sensitive content", async () => {
    const secret = "customer Alice cookie=secret@example.com";
    const log = vi.fn<ShadowDiagnosticLogger>();

    await observeShadowExecutiveRequestResolution({
      requestId: "req-7",
      channel: "text",
      organizationId: "org-1",
      understanding: understanding(),
      resolver: createShadowExecutiveRequestResolver(),
      log,
      ...({ message: secret } as Record<string, string>),
    });

    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    expect(log.mock.calls[0]?.[0]).toBe("[executive-request-resolution][shadow]");
  });

  it("contains resolver errors without rejecting the caller", async () => {
    const resolver: ExecutiveRequestResolver<ConversationUnderstanding> = {
      resolve: async () => { throw new Error("resolver failed"); },
    };

    await expect(observeShadowExecutiveRequestResolution({
      requestId: "req-8",
      channel: "text",
      organizationId: "org-1",
      understanding: understanding(),
      resolver,
      log: vi.fn(),
    })).resolves.toMatchObject({ outcome: "resolver_error" });
  });

  it("contains validation errors without rejecting the caller", async () => {
    const resolver = {
      resolve: async () => null,
    } as unknown as ExecutiveRequestResolver<ConversationUnderstanding>;

    const diagnostic = await observeShadowExecutiveRequestResolution({
      requestId: "req-9",
      channel: "text",
      organizationId: "org-1",
      understanding: understanding(),
      resolver,
      log: vi.fn(),
    });

    expect(diagnostic.outcome).toBe("validation_error");
    await expect(resolveExecutiveRequest(
      { requestId: "req-9", organizationId: "org-1", understanding: understanding() },
      resolver,
    )).rejects.toThrow(ExecutiveRequestResolutionValidationError);
  });

  it("records voice fast paths as skipped without observing resolution", () => {
    const log = vi.fn<ShadowDiagnosticLogger>();
    const diagnostic = recordShadowFastPathSkip({ requestId: "req-10", log });

    expect(diagnostic).toMatchObject({
      channel: "voice",
      outcome: "skipped_fast_path",
      durationMs: 0,
    });
    expect(log).toHaveBeenCalledOnce();
  });

  it("makes the existing duplicate classification visible without changing it", () => {
    const diagnostic = recordShadowDuplicateClassification({
      requestId: "req-11",
      channel: "text",
      upstreamUnderstandingAvailable: true,
      log: vi.fn(),
    });

    expect(diagnostic).toEqual({
      event: "duplicate_classification_scheduled",
      requestId: "req-11",
      channel: "text",
      upstreamUnderstandingAvailable: true,
      behaviorChanged: false,
    });
  });
});

describe("chat route shadow boundary", () => {
  it("owns resolver composition and does not know duplicate-classification details", () => {
    const routeSource = readFileSync(
      new URL("../../../app/api/ai/chat/route.ts", import.meta.url),
      "utf8",
    );

    expect(routeSource).toContain("const shadowResolver = createShadowExecutiveRequestResolver();");
    expect(routeSource).toContain("void observeShadowExecutiveRequestResolution({");
    expect(routeSource).toContain(
      "const requiresExecutiveReasoning = conversationUnderstanding.shouldInvokeExecutiveBrain;",
    );
    expect(routeSource).not.toContain("executiveRequestResolution,");
    expect(routeSource).not.toContain("recordShadowDuplicateClassification");
    expect(routeSource).not.toContain("duplicate_classification_scheduled");
    expect(routeSource).toContain("recordShadowFastPathSkip({ requestId });\n          return voiceFastResponse;");
  });
});

describe("shadow composition ownership", () => {
  it("does not export a global resolver singleton", () => {
    expect(requestResolutionApi).not.toHaveProperty("shadowExecutiveRequestResolver");
  });

  it("creates an isolated resolver for every composition call", () => {
    const first = createShadowExecutiveRequestResolver();
    const second = createShadowExecutiveRequestResolver();

    expect(first).not.toBe(second);
  });
});
