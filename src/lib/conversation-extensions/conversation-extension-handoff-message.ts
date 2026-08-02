// Single, domain-agnostic authority for turning any conversation-extension
// handoff into the assistant's user-facing message. Works purely off the
// generic ConversationExtensionHandoff shape (never a domain's outcomeCode
// vocabulary), so it applies unchanged to every current domain (customers,
// tasks, quotes) and any future one without new code per capability. A
// domain may still layer richer wording on top (see route.ts's
// buildCustomerCreateHandoffMessage), but whenever it doesn't, this is the
// floor every domain gets — the AI backend never gets to contradict an
// already-resolved extension outcome.

import type { ConversationExtensionHandoff } from "./conversation-extension-handoff";

export function buildUniversalHandoffMessage(handoff: ConversationExtensionHandoff): string | null {
  if (handoff.resultStatus === "FAILED") {
    return "Bu işlemi gerçekleştiremedim. Tekrar dener misiniz?";
  }
  if (handoff.resultStatus === "APPROVAL_REQUIRED") {
    return "Bu işlem onay gerektiriyor; devam etmeden önce onayınızı bekliyorum.";
  }
  if (handoff.resultStatus === "CLARIFICATION_REQUIRED") {
    if (handoff.entityResolution === "AMBIGUOUS" && handoff.candidateNames.length > 0) {
      return `Bu isimle eşleşen birden fazla kayıt var: ${joinNames(handoff.candidateNames)}. Hangisini kastettiğinizi belirtir misiniz?`;
    }
    if (handoff.entityResolution === "NOT_FOUND") {
      return "Bu isimle eşleşen bir kayıt bulamadım. Başka bir isimle mi deneyelim, yoksa yeni bir kayıt mı oluşturalım?";
    }
    return "Devam edebilmem için biraz daha bilgi verir misiniz?";
  }
  if (handoff.resultStatus === "EXECUTED") {
    if (handoff.navigationRequested && handoff.navigationStatus === "COMPLETED") {
      return "İlgili kaydı çalışma alanında açtım, sağ tarafta inceleyebilirsiniz.";
    }
    return "İşlemi tamamladım.";
  }
  return null;
}

function joinNames(names: readonly string[]): string {
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
}
