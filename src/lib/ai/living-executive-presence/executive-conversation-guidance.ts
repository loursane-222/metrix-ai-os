import type { ExecutiveBehaviorPlanV1 } from "./contracts";
import type { ExecutivePresenceSurface } from "@/lib/ai/identity/executive-identity-prompt";

// Natural-language realization of each primaryBehavior/interactionPosture —
// the enum token alone ("Davranış: LISTEN") tells the model which behavior
// pattern was selected but not what that pattern actually asks of it. This
// mirrors Executive Behavior OS's own framing (docs/constitution/METRIX
// FOUNDATION/05 - Executive Behavior OS 1.0.docx §3): a Behavior Pattern is
// a stance to embody in fresh words, not a template to fill in.
const PRIMARY_BEHAVIOR_GUIDANCE: Readonly<Record<ExecutiveBehaviorPlanV1["primaryBehavior"], string>> = {
  LISTEN: "Şu an en doğru davranış hemen çözüm veya analiz üretmek değil, dinlemek — karşı tarafın ne demek istediğini, amacını, hâlini anlamaya odaklan.",
  EXPLORE: "Yönetim amacı henüz net değil; eksik bilgiyi tamamlayacak doğru soruyu sor — konuşmayı uzatmak için değil, doğru amacı bulmak için.",
  CLARIFY: "Söylenen net değil; kararı gerçekten etkileyecek tek noktayı netleştir.",
  EXPLAIN: "Kullanıcının karar verebilmesi için gereken bilgiyi anlaşılır, yeterince ayrıntılı ama gereksiz uzatmadan ver.",
  GUIDE: "Alternatifleri, riskleri ve öncelikleri göster; kararı dayatmadan yön ver.",
  CHALLENGE: "Kanıta dayalı, sakin ama net bir itiraz veya sınır koy.",
  PROTECT: "Riskli bir işlemden önce anladığını doğrula; gerekirse işlemi durdur.",
  SUPPORT: "Yeni bilgi değil, güvenilir bir çalışma ortağı hissi ver — yükü paylaş, belirsizliği azalt.",
  ACT_WITH_USER: "Bu turda birlikte bir işlem yürütülüyor; net, doğrudan ve uygulamaya dönük ilerle.",
  CONFIRM: "Anlaşmayı kısaca doğrula, gereksiz tekrar etme.",
  WAIT: "Şimdi harekete geçme veya sonuç verme; bekle ve gözlemle.",
  OBSERVE: "Şu an konuşmayı yönlendirme; olanı sessizce takip et.",
  FOLLOW_UP: "Önceki bir konuyu doğal şekilde takip et.",
  RECOVER: "Önceki bir yanlış anlaşılmayı sahiplen ve düzelt; savunmaya geçme, kalıp özür tekrarlama.",
  CLOSE: "Konuşmayı doğal biçimde, gereksiz uzatmadan kapat.",
};

const POSTURE_GUIDANCE: Readonly<Record<ExecutiveBehaviorPlanV1["interactionPosture"], string>> = {
  CALM: "Sakin, istikrar veren bir ton kullan.",
  DIRECT: "Sonucu dolandırmadan, doğrudan söyle.",
  SUPPORTIVE: "Sıcak, insani, güven veren bir ton kullan.",
  FIRM: "Kanıta dayalı, net bir duruş sergile.",
  CURIOUS: "Meraklı ama saygılı bir tonla, yalnızca gerekli tek soruyu sor.",
  PROTECTIVE: "Dikkatli, koruyucu bir ton kullan.",
  REFLECTIVE: "Düşünceli, ölçülü bir tonla yaklaş.",
  ACCOUNTABLE: "Sorumluluğu üstlenen, hesap verebilir bir tonla konuş.",
};

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
    `- ${PRIMARY_BEHAVIOR_GUIDANCE[plan.primaryBehavior]}`,
    `- ${POSTURE_GUIDANCE[plan.interactionPosture]}`,
    `- Soru politikası: ${plan.questionPolicy}; açıklama: ${plan.explanationPolicy}; itiraz: ${plan.challengePolicy}.`,
    "- Kullanıcının belirlenmiş niyetini değiştirme; yeni intent, tool veya action üretme.",
    "- Hazır cevap veya örnek cümle kullanma; canonical cevabı mevcut gerçekler ve sonuçlarla doğal biçimde gerçekleştir.",
  ];
  // LISTEN is the behavior selected for casual/social turns — the one place
  // a business-analysis reflex would be most out of place.
  if (plan.primaryBehavior === "LISTEN") {
    guidance.push("- Bu gündelik veya insani bir mesaj; zorla iş analizine, KPI'a ya da aksiyon planına çevirme.");
  }
  if (surface === "voice" || surface === "realtime_voice" || surface === "fast_response" || surface === "continuity") {
    guidance.push("- Sunum yüzeyi sözlüdür: kısa cümleler kullan; markdown, başlık veya madde işareti kullanma.");
  }
  return guidance.join("\n");
}
