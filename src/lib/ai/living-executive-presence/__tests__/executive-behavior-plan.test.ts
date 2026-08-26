import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import {
  adaptExecutiveDirectiveToExecutiveBehaviorPlan,
  projectExecutiveConversationGuidance,
} from "..";
import { resolveExecutiveDirective } from "@/lib/ai/executive-directive";

const understanding = (
  overrides: Partial<ConversationUnderstanding> = {},
): ConversationUnderstanding => ({
  conversationKind: "company_related",
  userMotivation: "bilgi_almak",
  companyRelevance: "medium",
  actionExpectation: "none",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: false,
  suggestedHandling: "answer_only",
  reasoning: { summary: "", observations: [], uncertainty: [], whyThisHandling: "" },
  ...overrides,
});
const behaviorPlan = (overrides: Partial<ConversationUnderstanding> = {}) =>
  adaptExecutiveDirectiveToExecutiveBehaviorPlan(
    resolveExecutiveDirective({ understanding: understanding(overrides), assessment: null }),
  );

describe("ExecutiveBehaviorPlanV1 contract and semantic mapping", () => {
  it.each([
    ["basit günlük sohbet", { conversationKind: "general_chat", userMotivation: "sohbet_etmek", companyRelevance: "none" }, "LISTEN", "SUPPORTIVE"],
    ["eksik bilgi", { shouldAskClarification: true, suggestedHandling: "ask_clarification", confidence: "low" }, "CLARIFY", "CURIOUS"],
    ["yanlış varsayım", { userMotivation: "karar_destegi", shouldInvokeExecutiveBrain: true, suggestedHandling: "executive_reasoning" }, "CHALLENGE", "FIRM"],
    ["riskli işlem isteği", { userMotivation: "kayit_islem", actionExpectation: "explicit", shouldInvokeExecutiveBrain: true }, "PROTECT", "PROTECTIVE"],
    ["duygusal kullanıcı", { conversationKind: "general_chat", userMotivation: "sohbet_etmek", companyRelevance: "none" }, "LISTEN", "SUPPORTIVE"],
    ["direkt bilgi sorusu", {}, "EXPLAIN", "DIRECT"],
    ["tool sonucu bekleyen istek", { userMotivation: "kayit_islem", actionExpectation: "possible", suggestedHandling: "passive_note" }, "WAIT", "CALM"],
  ] as const)("%s için behavior semantics üretir", (_name, overrides, behavior, posture) => {
    const plan = behaviorPlan(overrides);
    expect(plan).toMatchObject({
      schemaVersion: "1.0",
      source: "executive_directive",
      primaryBehavior: behavior,
      interactionPosture: posture,
    });
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("yalnız kapalı contract alanlarını üretir", () => {
    const plan = behaviorPlan();
    expect(Object.keys(plan).sort()).toEqual([
      "challengePolicy", "confidence", "explanationPolicy", "interactionPosture",
      "pacingIntent", "primaryBehavior", "questionPolicy",
      "requiresExecutiveReasoning", "schemaVersion", "source",
    ].sort());
    expect(plan).not.toHaveProperty("content");
    expect(plan).not.toHaveProperty("response");
    expect(plan).not.toHaveProperty("tool");
    expect(plan).not.toHaveProperty("actionType");
    expect(plan).not.toHaveProperty("intent");
  });
});

describe("canonical Executive Conversation guidance", () => {
  it("projects semantics without answer copy, identity duplication or action authority", () => {
    const guidance = projectExecutiveConversationGuidance(
      behaviorPlan(),
    );
    expect(guidance).toContain("Davranış: EXPLAIN");
    expect(guidance).not.toMatch(/Şirketinin AI Genel Müdürü|Sen Metrix|örneğin|şöyle cevap/iu);
    expect(guidance).not.toMatch(/send_email|create_customer|actionType|toolName/iu);
    expect(guidance).toContain("yeni intent, tool veya action üretme");
  });

  it("voice ve text için ayrı plan producer bırakmaz", () => {
    const route = readFileSync(
      new URL("../../../../app/api/ai/chat/route.ts", import.meta.url),
      "utf8",
    );
    expect(route.match(/adaptExecutiveDirectiveToExecutiveBehaviorPlan\(/g)).toHaveLength(1);
    expect(route).not.toContain('channel === "voice" ? adaptExecutiveDirectiveToExecutiveBehaviorPlan');
  });

  it("voice ve textte aynı semantics, yalnız farklı sunum guidance'ı kullanır", () => {
    const plan = behaviorPlan();
    const chat = projectExecutiveConversationGuidance(plan, "chat");
    const voice = projectExecutiveConversationGuidance(plan, "voice");
    expect(voice).toContain("Davranış: EXPLAIN; duruş: DIRECT; tempo: CONCISE");
    expect(chat).toContain("Davranış: EXPLAIN; duruş: DIRECT; tempo: CONCISE");
    expect(voice).toContain("Sunum yüzeyi sözlüdür");
    expect(chat).not.toContain("Sunum yüzeyi sözlüdür");
  });

  it("translates the enum token into a real behavioral instruction, not just the label", () => {
    // Regression guard: the raw token alone ("Davranış: LISTEN") tells the
    // model which pattern was selected but not what it actually asks of it
    // — Behavior OS §3.1 explicitly rejects treating patterns as fill-in
    // templates, so the guidance must spell out what LISTEN/SUPPORTIVE mean.
    const listenPlan = behaviorPlan({ conversationKind: "general_chat", userMotivation: "sohbet_etmek", companyRelevance: "none" });
    const guidance = projectExecutiveConversationGuidance(listenPlan);
    expect(guidance).toContain("dinlemek");
    expect(guidance).toContain("Sıcak, insani, güven veren bir ton kullan.");
  });

  it("tells the model not to force a casual/social turn into business analysis", () => {
    // This is the canonical path's equivalent of LivingBehaviorProfile's
    // businessRedirection: "never_force" — ExecutiveBehaviorPlanV1 has no
    // such field, so without this the canonical prompt (the one actually
    // used for every real turn, per route.ts) had no protection against a
    // greeting or well-being question being answered as a business matter.
    const listenPlan = behaviorPlan({ conversationKind: "general_chat", userMotivation: "sohbet_etmek", companyRelevance: "none" });
    const guidance = projectExecutiveConversationGuidance(listenPlan);
    expect(guidance).toContain("zorla iş analizine");

    const explainPlan = behaviorPlan();
    expect(projectExecutiveConversationGuidance(explainPlan)).not.toContain("zorla iş analizine");
  });
});

describe("chat ownership boundaries", () => {
  const route = readFileSync(
    new URL("../../../../app/api/ai/chat/route.ts", import.meta.url),
    "utf8",
  );

  it("keeps one response and assistant persistence owner", () => {
    expect(route.match(/await sendAiMessage\(\{/g)).toHaveLength(1);
    expect(route).toContain("streamWithAiGateway");
    expect(route).not.toContain("sendVoiceAiMessage");
  });

  it("keeps repair in the same canonical lifecycle", () => {
    const repair = route.slice(route.indexOf("async function repairAiContent"));
    expect(repair).not.toContain("sendAiMessage(");
    expect(repair).not.toContain("controller.enqueue");
    expect(repair).toContain("provider: input.aiResponse.provider");
    expect(repair).toContain("executiveBehaviorPlan: input.executiveBehaviorPlan");
  });

  it("exposes repair and sanitization telemetry without message content", () => {
    for (const event of [
      "executive_response_sanitization_passed",
      "executive_response_repair_started",
      "executive_response_repair_completed",
      "executive_response_repair_failed",
    ]) {
      expect(route).toContain(event);
    }
    const telemetry = route.slice(
      route.indexOf('console.info("executive_response_sanitization_passed"'),
      route.indexOf("async function repairAiContent"),
    );
    expect(telemetry).not.toContain("userMessage:");
  });
});
