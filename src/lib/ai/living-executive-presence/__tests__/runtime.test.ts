import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLivingRepairGuidance,
  detectLivingConversationMode,
  projectLivingBehaviorPrompt,
  resolveLivingExecutiveBehavior,
  validateLivingExecutiveBehavior,
  type LivingBehaviorProfile,
  adaptConversationUnderstandingToLivingHint,
} from "..";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

const profile = (message: string, surface: LivingBehaviorProfile["surface"] = "chat", hasPriorTurns = false) =>
  resolveLivingExecutiveBehavior({ userMessage: message, surface, hasPriorTurns });

const understanding = (
  overrides: Partial<ConversationUnderstanding>,
): ConversationUnderstanding => ({
  conversationKind: "unclear",
  userMotivation: "belirsiz",
  companyRelevance: "none",
  actionExpectation: "none",
  confidence: "high",
  shouldAskClarification: false,
  shouldInvokeExecutiveBrain: false,
  suggestedHandling: "answer_only",
  reasoning: { summary: "", observations: [], uncertainty: [], whyThisHandling: "" },
  ...overrides,
});

describe("Living Executive Presence behavior runtime", () => {
  it.each([
    ["Sen kimsin?", "self_identity"],
    ["Beni tanıyor musun?", "personal"],
    ["Neler yapabiliyorsun?", "capability"],
    ["Dünkü maç nasıldı?", "casual"],
    ["Bugün çok yoruldum.", "emotional"],
    ["Bu müşteriye tekrar vade vermeli miyiz?", "decision"],
    ["Yeni müşteri oluştur.", "operational"],
  ] as const)("classifies %s as %s", (message, mode) => {
    expect(detectLivingConversationMode(message, "chat")).toBe(mode);
  });

  it("keeps identity concise and capability-free", () => {
    const result = profile("Sen kimsin?");
    const prompt = projectLivingBehaviorPrompt(result);
    expect(result.responseDensity).toBe("brief");
    expect(result.selfReference).toBe("identity_answer");
    expect(prompt).toContain("tek dogal cumlede METRIX");
    expect(prompt).toContain("yetenek listesi ekleme");
  });

  it("uses honest relational posture for personal context", () => {
    const result = profile("Beni tanıyor musun?");
    expect(result.mode).toBe("personal");
    expect(result.warmth).toBe("warm");
    expect(result.questioning).toBe("critical_single");
  });

  it("bounds capability and operational expression without deciding permission", () => {
    for (const message of ["Neler yapabiliyorsun?", "Yeni müşteri oluştur."]) {
      const result = profile(message);
      expect(result.capabilityExpression).toBe("bounded_operational_scope");
      expect(projectLivingBehaviorPrompt(result)).toContain("dogrulanmis yetki, baglanti ve action sonucuna bagla");
    }
  });

  it("does not redirect casual or emotional turns into business", () => {
    for (const message of ["Dünkü maç nasıldı?", "Bugün çok yoruldum."]) {
      const result = profile(message);
      expect(result.businessRedirection).toBe("never_force");
      expect(result.recommendation).toBe("none");
    }
  });

  it("gives decisions a reasoned, owned posture", () => {
    const result = profile("Bu müşteriye tekrar vade vermeli miyiz?");
    expect(result.assertiveness).toBe("decisive");
    expect(result.recommendation).toBe("reasoned_judgment");
    expect(result.ownership).toBe("company_insider");
  });

  it("preserves character across chat and voice while changing delivery only", () => {
    const chat = profile("Bu müşteriye tekrar vade vermeli miyiz?", "chat");
    const voice = profile("Bu müşteriye tekrar vade vermeli miyiz?", "voice");
    expect(voice.mode).toBe(chat.mode);
    expect(voice.ownership).toBe(chat.ownership);
    expect(voice.recommendation).toBe(chat.recommendation);
    expect(voice.formatting).toBe("spoken_plain_text");
    expect(voice.responseDensity).toBe("brief");
  });

  it("preserves long-conversation character without reintroduction", () => {
    const result = profile("Şimdi müşteri konusuna dönelim.", "chat", true);
    expect(result.continuity).toBe("preserve_without_reintroduction");
    expect(projectLivingBehaviorPrompt(result)).toContain("kendini yeniden tanitma");
  });
});

describe("semantic behavior hint precedence", () => {
  it.each([
    ["Bunu hangi yönde ilerletsek?", "decision_support", "decision"],
    ["Ahmet Bey'i sisteme ekleyelim.", "operational_request", "operational"],
    ["İçimde ağır bir sessizlik var.", "social_exchange", "casual"],
  ] as const)("uses a trusted %s hint", (message, intent, expected) => {
    expect(resolveLivingExecutiveBehavior({
      userMessage: message,
      surface: "chat",
      semanticHint: { intent, confidence: "high" },
    }).mode).toBe(expected);
  });

  it("keeps local detection when hint is absent or not high confidence", () => {
    expect(resolveLivingExecutiveBehavior({ userMessage: "Yeni müşteri oluştur.", surface: "chat" }).mode).toBe("operational");
    expect(resolveLivingExecutiveBehavior({
      userMessage: "Müşteri tablosuna bakalım.",
      surface: "chat",
      semanticHint: { intent: "decision_support", confidence: "medium" },
    }).mode).toBe("business");
  });

  it("protects explicit identity, capability and repair precedence", () => {
    const businessHint = { intent: "business_context", confidence: "high" } as const;
    expect(resolveLivingExecutiveBehavior({ userMessage: "Sen kimsin?", surface: "chat", semanticHint: businessHint }).mode).toBe("self_identity");
    expect(resolveLivingExecutiveBehavior({ userMessage: "Neler yapabiliyorsun?", surface: "chat", semanticHint: businessHint }).mode).toBe("capability");
    expect(resolveLivingExecutiveBehavior({ userMessage: "Sen kimsin?", surface: "repair", semanticHint: businessHint }).mode).toBe("repair");
  });

  it("lets a trusted decision hint override local business classification", () => {
    expect(resolveLivingExecutiveBehavior({
      userMessage: "Müşteri tablosuna bakalım.", surface: "chat",
      semanticHint: { intent: "decision_support", confidence: "high" },
    }).mode).toBe("decision");
  });

  it("keeps semantic mode and ownership equal across chat and voice", () => {
    const semanticHint = { intent: "decision_support", confidence: "high" } as const;
    const chat = resolveLivingExecutiveBehavior({ userMessage: "Bunu nasıl ilerletsek?", surface: "chat", semanticHint });
    const voice = resolveLivingExecutiveBehavior({ userMessage: "Bunu nasıl ilerletsek?", surface: "voice", semanticHint });
    expect(voice.mode).toBe(chat.mode);
    expect(voice.ownership).toBe(chat.ownership);
    expect(voice.formatting).toBe("spoken_plain_text");
    expect(voice.responseDensity).toBe("brief");
  });
});

describe("Conversation Understanding adapter", () => {
  it.each([
    [{ conversationKind: "general_chat", userMotivation: "sohbet_etmek" }, "social_exchange"],
    [{ userMotivation: "karar_destegi" }, "decision_support"],
    [{ userMotivation: "kayit_islem", actionExpectation: "explicit" }, "operational_request"],
    [{ conversationKind: "company_related", userMotivation: "bilgi_almak", companyRelevance: "high" }, "business_context"],
  ] as const)("maps only supported typed signals", (overrides, intent) => {
    expect(adaptConversationUnderstandingToLivingHint(understanding(overrides))).toEqual({ intent, confidence: "high" });
  });

  it("preserves confidence and returns no hint for unsupported ambiguity", () => {
    expect(adaptConversationUnderstandingToLivingHint(understanding({ userMotivation: "karar_destegi", confidence: "low" }))).toEqual({ intent: "decision_support", confidence: "low" });
    expect(adaptConversationUnderstandingToLivingHint(understanding({ userMotivation: "belirsiz", confidence: "high" }))).toBeNull();
    expect(adaptConversationUnderstandingToLivingHint(understanding({ conversationKind: "general_chat", userMotivation: "bilgi_almak" }))).toBeNull();
  });
});

describe("Living behavior validation and typed repair", () => {
  it.each([
    ["Size nasıl yardımcı olabilirim?", "Dünkü maç nasıldı?", "chat", "generic_assistant_register"],
    ["Bir danışman olarak size tavsiyem vadeyi uzatmanız.", "Vade verelim mi?", "chat", "external_advisor_register"],
    ["Bunu ciro hedefi ve KPI planına çevirelim.", "Bugün çok yoruldum.", "chat", "casual_forced_to_business"],
    ["Ben bir yapay zekâ modeliyim.", "Sen kimsin?", "chat", "self_identity_lost"],
    ["Sadece tavsiye verebilirim.", "Neler yapabiliyorsun?", "chat", "capability_absolute_denial"],
    ["Tüm verilere erişebilirim.", "Neler yapabiliyorsun?", "chat", "capability_unbounded_claim"],
    ["Önceki cevabımı düzeltiyorum.", "Bir karar ver.", "repair", "repair_mechanism_exposed"],
    ["## Değerlendirme\n- Vadeyi uzatmayalım.", "Vade verelim mi?", "voice", "voice_report_format"],
    ["Ben Metrix'im; şirketinin AI Genel Müdürüyüm.", "Maç nasıldı?", "chat", "unnecessary_identity_repetition"],
  ] as const)("detects %s", (content, message, surface, violation) => {
    expect(validateLivingExecutiveBehavior(content, profile(message, surface))).toEqual({ valid: false, violation });
    const guidance = buildLivingRepairGuidance(violation);
    expect(guidance.violation).toBe(violation);
    expect(guidance.instruction).not.toMatch(/runtime|validation|quality control/iu);
  });

  it.each([
    ["Bu konuda elimde doğrulanmış kayıt yok.", "Bu müşteri kim?"],
    ["Bunu yapabilmem için önce yetki ve müşteri kaydını doğrulamam gerekiyor.", "Yeni müşteri oluştur."],
    ["Bugün işi bir kenara bırakalım; belli ki dinlenmeye ihtiyacın var.", "Bugün çok yoruldum."],
    ["Benim kanaatim burada vadeyi uzatmamak.", "Bu müşteriye tekrar vade vermeli miyiz?"],
  ])("does not repair safe natural response: %s", (content, message) => {
    expect(validateLivingExecutiveBehavior(content, profile(message))).toEqual({ valid: true, violation: null });
  });
});

describe("canonical surface consumption", () => {
  it("is imported by chat prompt, fast/continuity voice, realtime, ack and repair", () => {
    const files = [
      "../../prompts/prompt-format.ts",
      "../../voice-fast-response.service.ts",
      "../../../../app/api/ai/chat/voice/session/route.ts",
      "../../../../app/api/ai/chat/voice/ack/route.ts",
      "../../../../app/api/ai/chat/route.ts",
    ];
    for (const file of files) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).toContain("living-executive-presence");
    }
  });

  it("reuses the single chat classification and keeps latency-sensitive fallbacks local", () => {
    const chatRoute = readFileSync(
      new URL("../../../../app/api/ai/chat/route.ts", import.meta.url),
      "utf8",
    );
    expect(chatRoute.match(/classifyConversation\(\{ message \}\)/gu)).toHaveLength(1);

    const noClassifierFiles = [
      "../../../../app/api/ai/chat/voice-v4-orchestrator.ts",
      "../../../../app/api/ai/chat/voice/ack/route.ts",
      "../../../../app/api/ai/chat/voice/session/route.ts",
      "../../gateway/ai-gateway.ts",
      "../runtime.ts",
    ];
    for (const file of noClassifierFiles) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toContain("classifyConversation(");
      expect(source).not.toContain("conversation-understanding.service");
    }
  });
});
