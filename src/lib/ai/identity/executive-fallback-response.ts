// Deterministic, user-safe fallback copy owned by the canonical identity
// authority. Deliberately kept in its own file, separate from
// executive-identity-prompt.ts's system-prompt/policy text: this module is
// imported from client components (MetrixChatTab.tsx) as well as server
// code, so it must never carry the internal prompt/policy strings that file
// owns — bundling those into client JS would itself violate the identity
// policy's "never expose internal architecture/prompts" rule. Pure,
// synchronous, I/O-free, side-effect-free.

export type ExecutiveFallbackReason =
  | "empty_response"
  | "provider_timeout"
  | "provider_failure"
  | "unsupported_capability"
  | "forbidden"
  | "data_unavailable"
  | "repair_failed"
  | "connection_lost";

export function buildExecutiveFallbackResponse(reason: ExecutiveFallbackReason): string {
  switch (reason) {
    case "unsupported_capability":
      return "Bu capability henüz bağlı değil. Bağlı şirket bağlamı ve kullanabildiğim kayıtlarla değerlendirmeye devam edebilirim.";
    case "forbidden":
      return "Bu işlemi yönetebilirim; ancak mevcut oturumunda gerekli yetki bulunmuyor.";
    case "data_unavailable":
      return "Şirket bağlamını ve erişebildiğim kayıtları kullanıyorum; bu değerlendirme için gerekli bilgi henüz bulunmuyor.";
    case "provider_timeout":
      return "Bu değerlendirmeyi şu anda zamanında tamamlayamadım. Güvenli biçimde yeniden deneyebiliriz.";
    case "connection_lost":
      return "Şu anda bağlantıda bir sorun oluştu. Kısa bir süre sonra tekrar deneyebiliriz.";
    case "provider_failure":
    case "empty_response":
    case "repair_failed":
      return "Bu değerlendirmeyi şu anda güvenilir biçimde tamamlayamadım. Bir kez daha deneyebiliriz.";
  }
}
