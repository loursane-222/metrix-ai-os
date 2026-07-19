import type {
  AiProvider,
  GenerateResponseInput,
  GenerateResponseResult,
} from "./ai-provider";
import type {
  MemoryContext,
  MemoryContextItem,
} from "@/lib/memory/memory-context.types";
import { buildExecutiveFallbackResponse } from "@/lib/ai/identity/executive-identity-prompt";

const MOCK_MODEL = "mock-foundation-v1";
const MEMORY_ITEM_LIMIT = 3;

export const mockProvider: AiProvider = {
  name: "mock",

  async generateResponse(
    input: GenerateResponseInput,
  ): Promise<GenerateResponseResult> {
    const intent = detectIntent(input.userMessage);
    const content = buildMockResponse(intent, input.context);

    return {
      content,
      model: MOCK_MODEL,
      provider: "mock",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
  },
};

type MockIntent =
  | "greeting"
  | "recognition_level"
  | "daily_focus"
  | "help"
  | "fallback";

function buildMockResponse(intent: MockIntent, context: MemoryContext): string {
  switch (intent) {
    case "greeting":
      return buildGreetingResponse(context);
    case "recognition_level":
      return buildRecognitionLevelResponse(context);
    case "daily_focus":
      return buildDailyFocusResponse(context);
    case "help":
      return buildHelpResponse(context);
    case "fallback":
      return buildFallbackResponse(context);
  }
}

function detectIntent(message: string): MockIntent {
  const normalizedMessage = normalizeMessage(message);

  if (
    includesAny(normalizedMessage, [
      "merhaba",
      "selam",
      "gunaydin",
      "iyi gunler",
      "iyi aksamlar",
      "hello",
      "hi",
    ])
  ) {
    return "greeting";
  }

  if (
    includesAny(normalizedMessage, [
      "beni ne kadar taniyorsun",
      "beni taniyor musun",
      "beni tanidın mı",
      "beni tanidin mi",
      "ne kadar taniyorsun",
      "beni ne kadar biliyorsun",
    ])
  ) {
    return "recognition_level";
  }

  if (
    includesAny(normalizedMessage, [
      "bugun neye odaklanmaliyim",
      "bugun neye odaklanayim",
      "neye odaklanmaliyim",
      "odak",
      "oncelik",
      "once ne yapmaliyim",
      "bugun ne yapmaliyim",
    ])
  ) {
    return "daily_focus";
  }

  if (
    includesAny(normalizedMessage, [
      "yardim",
      "ne yapabilirsin",
      "nasil yardim edersin",
      "nasil calisiyorsun",
      "metrix ne yapar",
    ])
  ) {
    return "help";
  }

  return "fallback";
}

function buildGreetingResponse(context: MemoryContext): string {
  if (!hasMemory(context)) {
    return "Merhaba.";
  }

  const keyItem = context.highlights[0] ?? context.strategic[0] ?? null;
  if (!keyItem) {
    return "Merhaba.";
  }

  return `Merhaba. ${keyItem.key} konusunda bugün nerede duruyoruz?`;
}

function buildRecognitionLevelResponse(context: MemoryContext): string {
  if (!hasMemory(context)) {
    return buildExecutiveFallbackResponse("data_unavailable");
  }

  const memorySummary = summarizeMemoryItems(getRepresentativeItems(context));

  return [
    `Hafızamdaki ${context.totalIncluded} aktif bilgiye göre seni şu başlıklarda tanıyorum: ${memorySummary}.`,
    "Bu bilgiler bağlamdır; kesin karar değildir. Çelişen veya eski bilgi görürsen düzeltmen en yüksek önceliktir.",
  ].join(" ");
}

function buildDailyFocusResponse(context: MemoryContext): string {
  if (!hasMemory(context)) {
    return "Bugün ilk hedefin ana darboğazı görünür hale getirmek olmalı. Bir iş sisteminde önce en çok zaman veya para kaybettiren noktayı netleştirmek gerekir. Bunu yaptıktan sonra tek bir takip ritmi kurmanı öneririm.";
  }

  const focusItems = getFocusItems(context);

  if (focusItems.length === 0) {
    return [
      "Hafızamdaki bilgiler sınırlı ama bugün üç adım öneririm:",
      "1. Ana hedefi tek cümleyle netleştir.",
      "2. Takibi aksayan süreci görünür hale getir.",
      "3. Gün sonunda ölçülebilir bir kontrol maddesi bırak.",
    ].join("\n");
  }

  return [
    "Hafızamdaki bilgilere göre bugün şu üç adıma odaklanmanı öneririm:",
    ...focusItems.map((item, index) => `${index + 1}. ${formatActionFromMemory(item)}`),
  ].join("\n");
}

function buildHelpResponse(context: MemoryContext): string {
  if (!hasMemory(context)) {
    return "Ne konuşmak istiyorsun?";
  }

  const focus = context.highlights[0] ?? context.strategic[0] ?? null;
  if (!focus) {
    return "Bugün hangi konuya bakmak istiyorsun?";
  }

  return `${focus.key} başta olmak üzere birkaç konuyu biliyorum. Bugün nereden başlamak istiyorsun?`;
}

function buildFallbackResponse(context: MemoryContext): string {
  if (!hasMemory(context)) {
    return "Anlat; dinliyorum.";
  }

  const keyItem = getRepresentativeItems(context)[0] ?? null;
  if (!keyItem) {
    return "Anlat; dinliyorum.";
  }

  return `${keyItem.key} konusuna bakarsak — bugün ilk adım ne olmalı?`;
}

function buildMemorySnapshotSentence(context: MemoryContext): string {
  const parts = [
    context.strategic.length > 0 ? `${context.strategic.length} stratejik yön` : null,
    context.facts.length > 0 ? `${context.facts.length} fakt` : null,
    context.processes.length > 0 ? `${context.processes.length} süreç bilgisi` : null,
    context.preferences.length > 0 ? `${context.preferences.length} tercih` : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return `Hafızamda ${context.totalIncluded} aktif bilgi var.`;
  }

  return `Hafızamda ${parts.join(", ")} bulunuyor.`;
}

function getRepresentativeItems(context: MemoryContext): MemoryContextItem[] {
  return [
    ...context.highlights,
    ...context.strategic,
    ...context.facts,
    ...context.processes,
    ...context.preferences,
  ].filter(uniqueMemoryItem).slice(0, MEMORY_ITEM_LIMIT);
}

function getFocusItems(context: MemoryContext): MemoryContextItem[] {
  return [
    ...context.strategic,
    ...context.processes,
    ...context.highlights,
    ...context.facts,
  ].filter(uniqueMemoryItem).slice(0, MEMORY_ITEM_LIMIT);
}

function summarizeMemoryItems(items: MemoryContextItem[]): string {
  if (items.length === 0) {
    return "aktif hafıza var ama öne çıkan başlık henüz az";
  }

  return items.map((item) => `${item.key}: ${item.value}`).join("; ");
}

function formatActionFromMemory(item: MemoryContextItem): string {
  if (item.type === "STRATEGIC") {
    return `${item.value} yönünü destekleyen tek bir ölçülebilir adım seç.`;
  }

  if (item.type === "PROCESS") {
    return `${item.key} alanında bugün takip edilecek net bir kontrol noktası belirle.`;
  }

  if (item.type === "PREFERENCE") {
    return `${item.value} tercihini koruyarak aksiyonu sade ve uygulanabilir tut.`;
  }

  return `${item.key} bilgisini dikkate alarak bugünkü önceliği netleştir.`;
}

function uniqueMemoryItem(
  item: MemoryContextItem,
  index: number,
  items: MemoryContextItem[],
): boolean {
  return items.findIndex((candidate) => candidate.id === item.id) === index;
}

function hasMemory(context: MemoryContext): boolean {
  return context.totalIncluded > 0;
}

function includesAny(message: string, needles: string[]): boolean {
  return needles.some((needle) => message.includes(needle));
}

function normalizeMessage(message: string): string {
  return message
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ");
}
