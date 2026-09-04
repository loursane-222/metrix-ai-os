import type { BusinessNavigationRequest, ConversationUnderstanding } from "./conversation-understanding.types";

/**
 * Deterministic, zero-LLM-call recognizer for COMPANY_SURFACE_NAVIGATION —
 * "open/show/manage my own company's [integrations]" requests.
 *
 * Exists because the LLM classifier's few-shot examples alone proved
 * unreliable in production for this exact intent class: "Şirketimin
 * entegrasyonlarını aç." was still sometimes classified as a clarification-
 * needed turn even after adding dedicated few-shot examples for it (see
 * business-navigation.ts's own history). Whether the Company/Integrations
 * Workspace opens must not depend on the model succeeding on this one
 * intent — mirrors the exact same "regex fast-path wins over the LLM call"
 * architecture management-intent.ts's recognizeManagementIntent already
 * establishes for financial/management questions (see route.ts's priority
 * chain: deterministicManagementIntent -> deterministicCompanySurfaceNavigation
 * -> fastPathResult -> classifyConversation). The LLM still runs afterward
 * for narration wording only (shouldInvokeExecutiveBrain stays true, same
 * as every other navigation-only example already in the prompt) — it is
 * never on the critical path for whether the surface opens.
 *
 * Conservative by design, same rule as management-intent.ts: a false
 * negative here just costs the normal LLM round-trip (unchanged behavior);
 * a false positive would silently hijack an unrelated turn, so every branch
 * below requires an explicit action verb, not just a topic keyword, and an
 * advisory/informational shape ("hangi entegrasyonları kullanmalıyım",
 * "nasıl kurmalıyım") is excluded up front regardless of what else matches —
 * that is a question seeking an opinion, not a request to open a surface.
 */

// No trailing `\b` on any alternative below: JS's `\b`/`\w` are ASCII-only
// even with the `u` flag, so a stem ending in a Turkish letter (aç, kur,
// bağlı, entegrasyonlarını, ...) sits between two non-\w characters at that
// position and `\b` silently never matches there — a real, previously
// documented bug in this codebase's own regex history. The character
// classes already extend each alternative to the natural end of the word,
// so a trailing `\b` was redundant on ASCII-ending stems and actively wrong
// on Turkish-letter-ending ones; a leading `\b` stays safe since every stem
// here starts with a plain ASCII letter.
const COMPANY_NOUN = /(?:şirket|sirket|firma)[a-zçğıöşü]*/iu;
const INTEGRATION_NOUN = /entegrasyon[a-zçğıöşü]*|bağlant[ıi][a-zçğıöşü]*|baglant[ıi][a-zçğıöşü]*/iu;
const PROVIDER_NAME = /\b(?:icloud|i̇cloud|google|bizim\s*hesap|bizimhesap)\b/iu;
const OPEN_SHOW_VERB = /\b(?:aç[a-zçğıöşü]*|ac[a-zçğıöşü]*|göster[a-zçğıöşü]*|goster[a-zçğıöşü]*|yönet[a-zçğıöşü]*|yonet[a-zçğıöşü]*|düzenle[a-zçğıöşü]*|duzenle[a-zçğıöşü]*|ayarla[a-zçğıöşü]*)/iu;
const CONNECT_VERB = /\b(?:bağla[a-zçğıöşü]*|bagla[a-zçğıöşü]*|bağl[ıi][a-zçğıöşü]*|bagl[ıi][a-zçğıöşü]*|kur[a-zçğıöşü]*)/iu;
const ADVISORY_PATTERN = /\bhangi\b|kullanmal[ıi]y|kurmal[ıi]y|nas[ıi]l\s+(?:kur|bağla|bagla)|öner|oner|tavsiye|sence|ne\s+d[üu]ş[üu]n|gerekli\s*mi|mant[ıi]kl[ıi]\s*m[ıi]/iu;

export type CompanySurfaceNavigationMatch = Readonly<{ companySection: "integrations" | null }>;

export function recognizeCompanySurfaceNavigation(message: string): CompanySurfaceNavigationMatch | null {
  const normalized = message.trim();
  if (!normalized) return null;
  // Checked first, regardless of what else matches — "entegrasyonları nasıl
  // kurmalıyım" would otherwise false-positive on CONNECT_VERB's "kur" stem.
  if (ADVISORY_PATTERN.test(normalized)) return null;

  const integrationsShaped = INTEGRATION_NOUN.test(normalized) || PROVIDER_NAME.test(normalized);
  if (integrationsShaped) {
    if (OPEN_SHOW_VERB.test(normalized) || CONNECT_VERB.test(normalized)) return { companySection: "integrations" };
    return null;
  }
  // Plain "open my company" shape — needs both the company noun and an
  // explicit open/show verb; the noun alone ("şirketimiz nasıl gidiyor")
  // must never open a surface on its own.
  if (COMPANY_NOUN.test(normalized) && OPEN_SHOW_VERB.test(normalized)) return { companySection: null };
  return null;
}

export function buildCompanySurfaceNavigationUnderstanding(match: CompanySurfaceNavigationMatch): ConversationUnderstanding {
  const businessNavigation: BusinessNavigationRequest = Object.freeze({
    operation: "NAVIGATE",
    domain: "company",
    target: "root",
    entityReference: null,
    companySection: match.companySection,
  });
  return Object.freeze({
    conversationKind: "company_related",
    userMotivation: "bilgi_almak",
    companyRelevance: "high",
    actionExpectation: "explicit",
    confidence: "high",
    shouldAskClarification: false,
    shouldInvokeExecutiveBrain: true,
    suggestedHandling: "executive_reasoning",
    businessNavigation,
    workspaceControl: null,
    externalEvidenceNeed: null,
    artifactRequest: null,
    reasoning: {
      summary: match.companySection === "integrations"
        ? "Şirket entegrasyonları/bağlantıları açma isteği deterministik olarak tanındı."
        : "Şirket profilini açma isteği deterministik olarak tanındı.",
      observations: [match.companySection ?? "root"],
      uncertainty: [],
      whyThisHandling: "Company Workspace/Entegrasyonlar erişimi LLM sınıflandırıcısının isteğe bağlı başarısına bırakılamaz; bu deterministik fast-path her zaman kazanır.",
    },
  });
}
