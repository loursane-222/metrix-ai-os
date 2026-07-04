// ─── Executive Conversation Opportunity Engine V1 ─────────────────────────────
//
// ExecutiveQuestion + ConversationSnapshot → "şimdi sorulmalı mı?" kararı verir.
// Kullanıcıya soru sormaz. Sadece ConversationOpportunity objesi üretir.
// Prisma import yok. DB çağrısı yok. async yok. Saf hesaplama.

import type {
  BuildConversationOpportunityInput,
  ConversationOpportunity,
  ConversationOpportunityTiming,
} from "./executive-conversation-opportunity.types";

import type { ExecutiveQuestion } from "@/lib/executive-question";

export function buildConversationOpportunity(
  input: BuildConversationOpportunityInput,
): ConversationOpportunity {
  const { question, snapshot } = input;

  // 1. shouldAsk false → SKIP
  if (!question.shouldAsk) {
    return resolve(question, "SKIP", "Soru üretilmedi — shouldAsk: false.", 1.0);
  }

  // 2. Bu key bu oturumda zaten soruldu → SKIP
  if (snapshot.recentlyAskedKeys.includes(question.targetKey)) {
    return resolve(
      question,
      "SKIP",
      `"${question.targetLabel}" bu oturumda zaten soruldu.`,
      1.0,
    );
  }

  // 3. Grade F + kullanıcı soru soruyorsa → baskı yapma, bir sonraki tura bırak
  if (question.readinessGrade === "F" && snapshot.isUserAsking) {
    return resolve(
      question,
      "NEXT_TURN",
      "Kullanıcı soru soruyor — kör analiz baskısı bir tur ertelendi.",
      0.70,
    );
  }

  // 4. Grade F → her zaman NOW
  if (question.readinessGrade === "F") {
    return resolve(
      question,
      "NOW",
      "Kritik bilgi eksikliği (Grade F) — kör analiz riski yüksek, hemen sorulmalı.",
      0.95,
    );
  }

  // 5. Konuşma çok yeni → NEXT_TURN
  if (snapshot.messageCount < 2) {
    return resolve(
      question,
      "NEXT_TURN",
      "Konuşma henüz yeni — doğal bir açılım bekleniyor.",
      0.80,
    );
  }

  // 6. Kullanıcı soru soruyorsa keserek sormak kötü deneyim → NEXT_TURN
  if (snapshot.isUserAsking) {
    return resolve(
      question,
      "NEXT_TURN",
      "Kullanıcı soru soruyor — yanıt verdikten sonra sorulacak.",
      0.75,
    );
  }

  // 7. INLINE + kullanıcı bilgi paylaşıyor → NOW
  if (question.mode === "INLINE" && snapshot.isUserSharing) {
    return resolve(
      question,
      "NOW",
      "Kullanıcı bilgi paylaşıyor ve soru INLINE — doğal pencere.",
      0.85,
    );
  }

  // 8. DIRECT + kullanıcı bilgi paylaşıyor → NOW
  if (question.mode === "DIRECT" && snapshot.isUserSharing) {
    return resolve(
      question,
      "NOW",
      "Kullanıcı bilgi paylaşıyor — doğrudan soru için uygun an.",
      0.80,
    );
  }

  // 9. Varsayılan → NEXT_TURN
  return resolve(
    question,
    "NEXT_TURN",
    "Şu an sormak için belirgin bir fırsat yok — sonraki tura bırakıldı.",
    0.50,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolve(
  question: ExecutiveQuestion,
  timing: ConversationOpportunityTiming,
  reason: string,
  confidence: number,
): ConversationOpportunity {
  const shouldAskNow = timing === "NOW";
  const selectedQuestion = selectQuestion(question, timing);

  return {
    generatedAt: new Date().toISOString(),
    shouldAskNow,
    timing,
    selectedQuestion,
    reason,
    confidence,
    targetKey: question.targetKey,
    readinessGrade: question.readinessGrade,
  };
}

function selectQuestion(
  question: ExecutiveQuestion,
  timing: ConversationOpportunityTiming,
): string {
  if (timing === "NOW") return question.primaryQuestion;
  if (timing === "NEXT_TURN") return question.fallbackQuestion;
  return "";
}
