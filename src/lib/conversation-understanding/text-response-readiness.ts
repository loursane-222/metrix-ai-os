import { tryFastPathClassification } from "./conversation-fast-path";

export type TextResponseReadinessMode = "immediate" | "progress" | "blocking";
export type TextResponseStatusCategory = "executive_analysis" | "data_lookup" | "customer_context" | "document_review" | "action_validation" | "general_processing";
export type TextResponseReadiness = Readonly<{ mode: TextResponseReadinessMode; statusCategory: TextResponseStatusCategory | null; statusContent: string | null }>;

const STATUS_CONTENT: Record<TextResponseStatusCategory, string> = {
  executive_analysis: "Öncelikleri ve mevcut bağlamı değerlendiriyorum.",
  data_lookup: "İlgili güncel kayıtları kontrol ediyorum.",
  customer_context: "İlgili müşteri ve işlem bağlamını kontrol ediyorum.",
  document_review: "Belgedeki alanları ve kayıt koşullarını doğruluyorum.",
  action_validation: "Yetki ve işlem koşullarını kontrol ediyorum.",
  general_processing: "İsteğin kapsamını ve gerekli bağlamı değerlendiriyorum.",
};

const BLOCKING_ACTIONS = [
  /(?:^|\s)(?:sil|gönder|gonder|kaydet|işle|isle|oluştur|olustur|müşteri aç|musteri ac|güncelle|guncelle|bloke et|aktar)(?:\s|$)/u,
  /(?:hazırla|hazirla).*(?:gönder|gonder)/u,
  /(?:tahsilat|ödeme|odeme).*(?:kaydet|işle|isle)/u,
];
const DOCUMENT_SIGNALS = /(?:belge|fatura|vergi levhası|vergi levhasi|doküman|dokuman)/u;
const CUSTOMER_SIGNALS = /(?:müşteri|musteri|teklif|atlas|cari)/u;
const DATA_SIGNALS = /(?:getir|listele|kayıt|kayit|bugünkü|bugunku|incele|kontrol et)/u;
const EXECUTIVE_SIGNALS = /(?:şirket|sirket|öncelik|oncelik|risk|satış|satis|nakit|neden düştü|neden dustu|değerlendir|degerlendir|yorumla|strateji|karar)/u;

function normalize(message: string): string {
  return message.trim().toLocaleLowerCase("tr-TR").replace(/[.,!?…"'’]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function status(category: TextResponseStatusCategory): TextResponseReadiness {
  return { mode: category === "action_validation" ? "blocking" : "progress", statusCategory: category, statusContent: STATUS_CONTENT[category] };
}

// This zero-provider decision never decides the answer. Unknown input is
// deliberately visible as processing instead of being guessed as safe.
export function resolveTextResponseReadiness(message: string): TextResponseReadiness {
  if (tryFastPathClassification(message).matched) return { mode: "immediate", statusCategory: null, statusContent: null };
  const normalized = normalize(message);
  if (BLOCKING_ACTIONS.some((pattern) => pattern.test(normalized))) return status("action_validation");
  if (DOCUMENT_SIGNALS.test(normalized)) return status("document_review");
  if (CUSTOMER_SIGNALS.test(normalized)) return status("customer_context");
  if (EXECUTIVE_SIGNALS.test(normalized)) return status("executive_analysis");
  if (DATA_SIGNALS.test(normalized)) return status("data_lookup");
  return status("general_processing");
}
