import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import * as requestResolutionApi from "..";

import {
  ShadowExecutiveRequestResolver,
  createCapabilityProviderRegistry,
  ExecutiveRequestResolutionValidationError,
  createShadowCapabilityProviderRegistry,
  createShadowExecutiveRequestResolver,
  observeShadowExecutiveRequestResolution,
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
        shouldInvokeExecutiveBrain: true,
        suggestedHandling: "executive_reasoning",
      }),
    });

    expect(result.executionStrategy).toBe("READ");
    expect(result.executionMode).toBe("READ_ONLY");
    expect(result.capabilities[0]?.capabilityId).toBe("company.context-read");
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

  it("returns an auditable NO_MATCH when the selected provider is missing", async () => {
    const resolver = new ShadowExecutiveRequestResolver(createCapabilityProviderRegistry());
    const result = await resolver.resolve({
      requestId: "req-no-provider",
      organizationId: "org-1",
      understanding: understanding(),
    });

    expect(result.status).toBe("NO_MATCH");
    expect(result.capabilityAuthority).toMatchObject({
      outcome: "NO_PROVIDER",
      reason: "NO_PROVIDER",
      capabilityId: "conversation.general-answer",
    });
  });

  it.each([
    {
      name: "general conversation",
      input: understanding(),
      status: "RESOLVED",
      capabilityId: "conversation.general-answer",
      strategy: "ANSWER",
    },
    {
      name: "company read wins over executive-brain gating",
      input: understanding({
        conversationKind: "company_related",
        userMotivation: "bilgi_almak",
        companyRelevance: "high",
        shouldInvokeExecutiveBrain: true,
        suggestedHandling: "executive_reasoning",
      }),
      status: "RESOLVED",
      capabilityId: "company.context-read",
      strategy: "READ",
    },
    {
      name: "decision support",
      input: understanding({
        conversationKind: "company_related",
        userMotivation: "karar_destegi",
        companyRelevance: "high",
        shouldInvokeExecutiveBrain: true,
        suggestedHandling: "executive_reasoning",
      }),
      status: "RESOLVED",
      capabilityId: "executive.analyze",
      strategy: "ANALYZE",
    },
    {
      name: "general explicit action",
      input: understanding({ actionExpectation: "explicit" }),
      status: "NO_MATCH",
      capabilityId: undefined,
      strategy: null,
    },
  ])("classifies $name deterministically", async ({ input, status, capabilityId, strategy }) => {
    const result = await createShadowExecutiveRequestResolver().resolve({
      requestId: "req-table",
      organizationId: "org-1",
      understanding: input,
    });

    expect(result.status).toBe(status);
    expect(result.capabilities[0]?.capabilityId).toBe(capabilityId);
    expect(result.executionStrategy).toBe(strategy);
  });

  it("does not declare customer surface authority without page context", () => {
    const registry = createShadowCapabilityProviderRegistry();
    const provider = registry.getProvider("customer-surface-provider");

    expect(provider).toBeNull();
    expect(registry.findProviders("customer.surface-candidate")).toHaveLength(0);
  });

  it("declares identity and research truth without authoritative matching signals", async () => {
    const registry = createShadowCapabilityProviderRegistry();
    const identity = registry.getProvider("executive-identity-provider");
    const research = registry.getProvider("interactive-research-provider");
    const result = await createShadowExecutiveRequestResolver().resolve({
      requestId: "req-taxonomy-truth",
      organizationId: "org-1",
      understanding: understanding(),
    });

    expect(identity?.availability).toBe("DECLARED_NOT_EXECUTABLE");
    expect(research?.availability).toBe("UNAVAILABLE");
    expect(result.capabilities[0]?.capabilityId).toBe("conversation.general-answer");
    expect(result.capabilities.some((item) => item.capabilityId.includes("identity"))).toBe(false);
    expect(result.capabilities.some((item) => item.capabilityId.includes("research"))).toBe(false);
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
    expect(diagnostic.capabilityAuthorityOutcome).toBe("AUTHORITATIVE");
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

});

describe("chat route shadow boundary", () => {
  it("owns resolver composition and does not know duplicate-classification details", () => {
    const removedDiagnosticExport = ["recordShadowDuplicate", "Classification"].join("");
    const removedDiagnosticEvent = ["duplicate", "classification", "scheduled"].join("_");
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
    expect(requestResolutionApi).not.toHaveProperty(removedDiagnosticExport);
    expect(routeSource).not.toContain(removedDiagnosticExport);
    expect(routeSource).not.toContain(removedDiagnosticEvent);
    expect(routeSource).toContain("understanding: conversationUnderstanding,");
    expect(routeSource.match(/classifyConversation\(/g)).toHaveLength(1);
    expect(routeSource).toContain("recordShadowFastPathSkip({ requestId });\n          return voiceFastResponse;");
  });

  it("keeps Executive Intelligence free of classification ownership", () => {
    const removedDiagnosticEvent = ["duplicate", "classification", "scheduled"].join("_");
    const serviceSource = readFileSync(
      new URL("../../executive-intelligence/executive-intelligence.service.ts", import.meta.url),
      "utf8",
    );
    const adapterSource = readFileSync(
      new URL("../../ai/chat-executive-intelligence.adapter.ts", import.meta.url),
      "utf8",
    );

    expect(serviceSource).not.toContain("classifyConversation");
    expect(adapterSource).not.toContain("classifyConversation");
    expect(adapterSource).not.toContain(removedDiagnosticEvent);
  });

  it("waits for the single cognition result before handing its EOS to the gateway", () => {
    const routeSource = readFileSync(
      new URL("../../../app/api/ai/chat/route.ts", import.meta.url),
      "utf8",
    );

    expect(routeSource).toContain("const cognitionPromise = resolveChatExecutiveCognition({");
    expect(routeSource).toContain("const cognition = await cognitionPromise;");
    expect(routeSource).toContain('responseReadiness.mode === "immediate"\n      ? null\n      : await learningLoopPromise');
    expect(routeSource).toContain("const executiveOperatingSystem = cognition.executiveOperatingSystem;");
    expect(routeSource).toContain("executiveOperatingSystem,\n      requiresExecutiveReasoning,");
    expect(routeSource).not.toContain(
      "const executiveOperatingSystem: ExecutiveOperatingSystem | null = null",
    );
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
