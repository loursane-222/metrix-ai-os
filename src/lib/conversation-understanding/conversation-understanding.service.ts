import OpenAI from "openai";
import { CONVERSATION_UNDERSTANDING_SYSTEM_PROMPT } from "./conversation-understanding.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import type {
  ActionExpectation,
  CompanyRelevance,
  ConfidenceLevel,
  ConversationKind,
  ConversationUnderstanding,
  ConversationUnderstandingInput,
  SuggestedHandling,
  UserMotivation,
} from "./conversation-understanding.types";

const CONVERSATION_UNDERSTANDING_MODEL = "gpt-4.1-mini";

const DEFAULT_CLARIFICATION_QUESTION = "Bunu biraz daha açabilir misin?";

const VALID_CONVERSATION_KINDS: ConversationKind[] = [
  "general_chat", "company_related", "mixed", "unclear",
];
const VALID_MOTIVATIONS: UserMotivation[] = [
  "bilgi_almak", "sohbet_etmek", "karar_destegi",
  "kayit_islem", "planlama", "belirsiz",
];
const VALID_RELEVANCE: CompanyRelevance[] = ["none", "low", "medium", "high"];
const VALID_ACTION: ActionExpectation[] = ["none", "possible", "explicit"];
const VALID_CONFIDENCE: ConfidenceLevel[] = ["low", "medium", "high"];
const VALID_HANDLING: SuggestedHandling[] = [
  "answer_only", "ask_clarification", "executive_reasoning", "passive_note",
];

// Servis anlayamadığında sessizce answer_only dönmek yanlış cevap riskini artırır.
// Fallback her zaman netleştirme ister.
const SAFE_FALLBACK: ConversationUnderstanding = {
  conversationKind: "unclear",
  userMotivation: "belirsiz",
  companyRelevance: "none",
  actionExpectation: "none",
  confidence: "low",
  shouldAskClarification: true,
  clarificationQuestion: DEFAULT_CLARIFICATION_QUESTION,
  shouldInvokeExecutiveBrain: false,
  suggestedHandling: "ask_clarification",
  reasoning: {
    summary: "Conversation understanding servisi çıktı üretemedi; güvenli varsayılan kullanıldı.",
    observations: [],
    uncertainty: ["LLM çağrısı başarısız oldu veya geçersiz JSON döndü."],
    whyThisHandling: "Hata durumunda en güvenli yol: bağlamı netleştir, işlem yapma.",
  },
};

function isValidEnum<T extends string>(value: unknown, valid: T[]): value is T {
  return typeof value === "string" && (valid as string[]).includes(value);
}

function validateUnderstanding(raw: unknown): ConversationUnderstanding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (!isValidEnum(r.conversationKind, VALID_CONVERSATION_KINDS)) return null;
  if (!isValidEnum(r.userMotivation, VALID_MOTIVATIONS)) return null;
  if (!isValidEnum(r.companyRelevance, VALID_RELEVANCE)) return null;
  if (!isValidEnum(r.actionExpectation, VALID_ACTION)) return null;
  if (!isValidEnum(r.confidence, VALID_CONFIDENCE)) return null;
  if (typeof r.shouldAskClarification !== "boolean") return null;
  if (typeof r.shouldInvokeExecutiveBrain !== "boolean") return null;
  if (!isValidEnum(r.suggestedHandling, VALID_HANDLING)) return null;

  const rsn = r.reasoning;
  if (!rsn || typeof rsn !== "object") return null;
  const rs = rsn as Record<string, unknown>;
  if (typeof rs.summary !== "string") return null;
  if (!Array.isArray(rs.observations)) return null;
  if (!Array.isArray(rs.uncertainty)) return null;
  if (typeof rs.whyThisHandling !== "string") return null;

  const clarificationQuestion =
    typeof r.clarificationQuestion === "string" && r.clarificationQuestion.trim()
      ? r.clarificationQuestion
      : r.shouldAskClarification === true
        ? DEFAULT_CLARIFICATION_QUESTION
        : undefined;

  return {
    conversationKind: r.conversationKind,
    userMotivation: r.userMotivation,
    companyRelevance: r.companyRelevance,
    actionExpectation: r.actionExpectation,
    confidence: r.confidence,
    shouldAskClarification: r.shouldAskClarification,
    clarificationQuestion,
    shouldInvokeExecutiveBrain: r.shouldInvokeExecutiveBrain,
    suggestedHandling: r.suggestedHandling,
    reasoning: {
      summary: rs.summary,
      observations: rs.observations.filter((o): o is string => typeof o === "string"),
      uncertainty: rs.uncertainty.filter((u): u is string => typeof u === "string"),
      whyThisHandling: rs.whyThisHandling,
    },
  };
}

export async function classifyConversation(
  input: ConversationUnderstandingInput,
): Promise<ConversationUnderstanding> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return SAFE_FALLBACK;

    const client = new OpenAI({ apiKey });

    const userContent = input.recentMessages?.length
      ? `Önceki mesajlar:\n${input.recentMessages.join("\n")}\n\nSon mesaj:\n${input.message}`
      : input.message;

    const tOpenAI = performance.now();
    const response = await client.responses.create({
      model: CONVERSATION_UNDERSTANDING_MODEL,
      instructions: CONVERSATION_UNDERSTANDING_SYSTEM_PROMPT,
      input: userContent,
      max_output_tokens: 500,
      temperature: 0,
      store: false,
    });
    logOpenAiTelemetry("conversation-understanding", response, Math.round(performance.now() - tOpenAI));

    const text = response.output_text?.trim();
    if (!text) return SAFE_FALLBACK;

    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return SAFE_FALLBACK;
    }

    return validateUnderstanding(parsed) ?? SAFE_FALLBACK;
  } catch {
    return SAFE_FALLBACK;
  }
}
