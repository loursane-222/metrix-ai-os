import type { ExecutiveBehaviorPlanV1 } from "./contracts";
import type { ExecutivePresenceSurface } from "@/lib/ai/identity/executive-identity-prompt";

/**
 * Projects behavior into concise realization guidance. This layer cannot
 * change intent, request tools/actions, or provide candidate answer copy.
 */
export function projectExecutiveConversationGuidance(
  plan: ExecutiveBehaviorPlanV1,
  surface: ExecutivePresenceSurface = "chat",
): string {
  const guidance = [
    "EXECUTIVE CONVERSATION GUIDANCE (yalnızca bu turnün ifade biçimi):",
    `- Davranış: ${plan.primaryBehavior}; duruş: ${plan.interactionPosture}; tempo: ${plan.pacingIntent}.`,
    `- Soru politikası: ${plan.questionPolicy}; açıklama: ${plan.explanationPolicy}; itiraz: ${plan.challengePolicy}.`,
    "- Kullanıcının belirlenmiş niyetini değiştirme; yeni intent, tool veya action üretme.",
    "- Hazır cevap veya örnek cümle kullanma; canonical cevabı mevcut gerçekler ve sonuçlarla doğal biçimde gerçekleştir.",
  ];
  if (surface === "voice" || surface === "realtime_voice" || surface === "fast_response" || surface === "continuity") {
    guidance.push("- Sunum yüzeyi sözlüdür: kısa cümleler kullan; markdown, başlık veya madde işareti kullanma.");
  }
  return guidance.join("\n");
}
