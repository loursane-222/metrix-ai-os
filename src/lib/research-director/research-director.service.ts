import {
  createOpenAiResearchProvider,
} from "@/lib/ai/providers/openai-provider";
import type { ResearchUrlCitation } from "@/lib/ai/providers/openai-provider";

import type {
  BriefingRawPackage,
  ResearchBatchResult,
  ResearchConfidenceLevel,
  ResearchResultItem,
  ResearchSourceCategory,
  ResearchSourceDefinition,
  ResearchTier,
  ResearchUsedSource,
  RunDailyResearchInput,
} from "./research-director.types";

// ─── Kaynak Kataloğu ─────────────────────────────────────────────────────────

export const SOURCE_CATALOG: ResearchSourceDefinition[] = [
  // TIER 1 — Günlük Zorunlu: Türkiye Ekonomi
  { domain: "bloomberght.com",  name: "Bloomberg HT",          category: "TR_ECONOMY",          tier: "TIER_1_DAILY",    language: "tr" },
  { domain: "dunya.com",        name: "Dünya Gazetesi",         category: "TR_ECONOMY",          tier: "TIER_1_DAILY",    language: "tr" },
  { domain: "ekonomim.com",     name: "Ekonomim",               category: "TR_ECONOMY",          tier: "TIER_1_DAILY",    language: "tr" },
  { domain: "aafinans.com.tr",  name: "AA Finans",              category: "TR_ECONOMY",          tier: "TIER_1_DAILY",    language: "tr" },
  { domain: "tcmb.gov.tr",      name: "TCMB",                   category: "OFFICIAL_INSTITUTION", tier: "TIER_1_DAILY",    language: "tr" },
  // TIER 1 — Günlük Zorunlu: Global Ekonomi
  { domain: "bloomberg.com",    name: "Bloomberg",              category: "GLOBAL_ECONOMY",      tier: "TIER_1_DAILY",    language: "en" },
  { domain: "reuters.com",      name: "Reuters",                category: "GLOBAL_ECONOMY",      tier: "TIER_1_DAILY",    language: "en" },
  { domain: "ft.com",           name: "Financial Times",        category: "GLOBAL_ECONOMY",      tier: "TIER_1_DAILY",    language: "en" },
  // TIER 2 — Günlük Opsiyonel: Genel Gündem
  { domain: "hurriyet.com.tr",  name: "Hürriyet",               category: "GENERAL_NEWS",        tier: "TIER_2_DAILY",    language: "tr" },
  { domain: "haberturk.com",    name: "Habertürk",              category: "GENERAL_NEWS",        tier: "TIER_2_DAILY",    language: "tr" },
  // TIER 3 — Haftalık: Resmi Kurumlar
  { domain: "tuik.gov.tr",      name: "TÜİK",                   category: "OFFICIAL_INSTITUTION", tier: "TIER_3_WEEKLY",   language: "tr" },
  { domain: "ticaret.gov.tr",   name: "Ticaret Bakanlığı",      category: "OFFICIAL_INSTITUTION", tier: "TIER_3_WEEKLY",   language: "tr" },
  { domain: "federalreserve.gov", name: "Federal Reserve",      category: "OFFICIAL_INSTITUTION", tier: "TIER_3_WEEKLY",   language: "en" },
  { domain: "ecb.europa.eu",    name: "ECB",                    category: "OFFICIAL_INSTITUTION", tier: "TIER_3_WEEKLY",   language: "en" },
  { domain: "imf.org",          name: "IMF",                    category: "OFFICIAL_INSTITUTION", tier: "TIER_3_WEEKLY",   language: "en" },
  // TIER 3 — Haftalık: Yönetim ve Strateji
  { domain: "hbr.org",          name: "Harvard Business Review", category: "MANAGEMENT_STRATEGY", tier: "TIER_3_WEEKLY",   language: "en" },
  { domain: "mckinsey.com",     name: "McKinsey Insights",      category: "MANAGEMENT_STRATEGY", tier: "TIER_3_WEEKLY",   language: "en" },
  { domain: "bain.com",         name: "Bain Insights",          category: "MANAGEMENT_STRATEGY", tier: "TIER_3_WEEKLY",   language: "en" },
  // TIER 4 — On-demand: Araştırma Verileri
  { domain: "statista.com",     name: "Statista",               category: "RESEARCH_DATA",       tier: "TIER_4_ON_DEMAND", language: "en" },
  { domain: "oecd.org",         name: "OECD",                   category: "RESEARCH_DATA",       tier: "TIER_4_ON_DEMAND", language: "en" },
  { domain: "tradingeconomics.com", name: "Trading Economics",  category: "RESEARCH_DATA",       tier: "TIER_4_ON_DEMAND", language: "en" },
  { domain: "worldbank.org",    name: "World Bank",             category: "RESEARCH_DATA",       tier: "TIER_4_ON_DEMAND", language: "en" },
  { domain: "comtradeplus.un.org", name: "UN Comtrade",         category: "RESEARCH_DATA",       tier: "TIER_4_ON_DEMAND", language: "en" },
  { domain: "sloanreview.mit.edu", name: "MIT Sloan Review",    category: "MANAGEMENT_STRATEGY", tier: "TIER_4_ON_DEMAND", language: "en" },
];

// ─── Batch Tanımları ──────────────────────────────────────────────────────────

type ResearchBatchConfig = {
  id: string;
  tier: ResearchTier;
  primaryCategory: ResearchSourceCategory;
  domains: string[];
  buildQuery: (companyContext: string | null) => string;
  weeklyOnly: boolean;
};

const RESEARCH_BATCHES: ResearchBatchConfig[] = [
  {
    id: "tr_economy",
    tier: "TIER_1_DAILY",
    primaryCategory: "TR_ECONOMY",
    domains: ["bloomberght.com", "dunya.com", "ekonomim.com", "aafinans.com.tr", "tcmb.gov.tr"],
    buildQuery: (ctx) =>
      `Bugünün en önemli Türkiye ekonomi haberleri: faiz kararları, döviz kuru, enflasyon, büyüme, iş dünyası gelişmeleri, piyasalar.${ctx ? ` Şirket bağlamı: ${ctx}` : ""}`,
    weeklyOnly: false,
  },
  {
    id: "global_economy",
    tier: "TIER_1_DAILY",
    primaryCategory: "GLOBAL_ECONOMY",
    domains: ["bloomberg.com", "reuters.com", "ft.com"],
    buildQuery: (ctx) =>
      `Today's most critical global economic developments: markets, interest rates, inflation, trade, supply chain.${ctx ? ` Company context: ${ctx}` : ""}`,
    weeklyOnly: false,
  },
  {
    id: "general_news_economy",
    tier: "TIER_2_DAILY",
    primaryCategory: "GENERAL_NEWS",
    domains: ["hurriyet.com.tr", "haberturk.com"],
    buildQuery: (ctx) =>
      `Bugünün Türkiye ekonomi ve iş dünyası haberleri. Yalnızca ekonomi, finans ve iş dünyası.${ctx ? ` Bağlam: ${ctx}` : ""}`,
    weeklyOnly: false,
  },
  {
    id: "official_strategy_weekly",
    tier: "TIER_3_WEEKLY",
    primaryCategory: "OFFICIAL_INSTITUTION",
    domains: ["tuik.gov.tr", "ticaret.gov.tr", "federalreserve.gov", "ecb.europa.eu", "imf.org", "hbr.org", "mckinsey.com", "bain.com"],
    buildQuery: (ctx) =>
      `Latest economic data releases, central bank decisions, and management strategy insights this week.${ctx ? ` Company context: ${ctx}` : ""}`,
    weeklyOnly: true,
  },
];

// ─── Prompt ──────────────────────────────────────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = [
  "Sen bir ekonomi ve yönetim araştırmacısısın.",
  "Görevin belirtilen web kaynaklarından güncel ve önemli ekonomi, finans ve iş dünyası haberlerini bulmak ve özetlemektir.",
  "",
  "Kurallar:",
  "- Sadece ekonomi, finans, iş dünyası, piyasalar ve yönetim haberlerini al.",
  "- Spor, magazin, eğlence ve ekonomik bağlantısı olmayan siyasi haberleri kesinlikle alma.",
  "- Her haber için başlık, kaynak domain ve kısa özet (2-3 cümle) yaz.",
  "- En fazla 5 en önemli haberi numaralı liste halinde yaz.",
  "- Format: [Numara]. [Başlık] | Kaynak: [domain] | Özet: [özet]",
  "- Her zaman kaynaklara atıfta bulun; kaynaksız bilgi yazma.",
].join("\n");

// ─── Konum ───────────────────────────────────────────────────────────────────

const ISTANBUL_LOCATION = {
  country: "TR",
  city: "Istanbul",
  region: "Istanbul",
  timezone: "Europe/Istanbul",
} as const;

// ─── Ana Servis ───────────────────────────────────────────────────────────────

export async function runDailyResearch(
  input: RunDailyResearchInput,
): Promise<BriefingRawPackage> {
  const generatedAt = new Date().toISOString();
  const isMonday = new Date().getDay() === 1;
  const runWeekly = input.isWeeklyDay ?? isMonday;

  const activeBatches = RESEARCH_BATCHES.filter(
    (batch) => !batch.weeklyOnly || runWeekly,
  );

  const batchResults: ResearchBatchResult[] = [];

  for (const batchConfig of activeBatches) {
    const result = await runResearchBatch(
      batchConfig,
      input.companyContext ?? null,
    );
    batchResults.push(result);
  }

  const allSources = deduplicateSources(
    batchResults.flatMap((b) => b.usedSources),
  );
  const overallConfidenceScore = calculateOverallConfidenceScore(batchResults);

  return {
    organizationId: input.organizationId,
    generatedAt,
    batches: batchResults,
    totalItems: batchResults.reduce((sum, b) => sum + b.items.length, 0),
    totalSourcesUsed: allSources,
    totalSourceCount: allSources.length,
    overallConfidenceLevel: scoreToLevel(overallConfidenceScore),
    overallConfidenceScore,
  };
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

async function runResearchBatch(
  config: ResearchBatchConfig,
  companyContext: string | null,
): Promise<ResearchBatchResult> {
  const researchedAt = new Date().toISOString();
  const query = config.buildQuery(companyContext);

  try {
    const provider = createOpenAiResearchProvider({
      allowedDomains: config.domains,
      searchContextSize: "medium",
      userLocation: ISTANBUL_LOCATION,
    });

    const result = await provider.generateResearch({
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      researchQuery: query,
    });

    const usedSources = mapCitationsToSources(result.urlCitations);
    const confidenceScore = calculateBatchConfidenceScore(result.citationCount);

    return {
      tier: config.tier,
      query,
      items: parseResearchItems(
        result.content,
        usedSources,
        config.primaryCategory,
      ),
      usedSources,
      sourceCount: usedSources.length,
      confidenceLevel: scoreToLevel(confidenceScore),
      confidenceScore,
      researchedAt,
      rawContent: result.content,
    };
  } catch {
    // Hata durumunda crash etme — LOW confidence ile boş batch dön
    return buildEmptyBatch(config.tier, query, researchedAt);
  }
}

// ─── Kaynak Şeffaflığı ────────────────────────────────────────────────────────

function mapCitationsToSources(
  citations: ResearchUrlCitation[],
): ResearchUsedSource[] {
  return citations.map((citation) => {
    const domain = extractDomain(citation.url);
    const catalogEntry = SOURCE_CATALOG.find(
      (s) => domain === s.domain || domain.endsWith(`.${s.domain}`),
    );
    return {
      domain,
      name: catalogEntry?.name ?? domain,
      url: citation.url,
      title: citation.title || null,
    };
  });
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function deduplicateSources(sources: ResearchUsedSource[]): ResearchUsedSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = s.url ?? s.domain;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── İçerik Ayrıştırma ───────────────────────────────────────────────────────

function parseResearchItems(
  content: string,
  usedSources: ResearchUsedSource[],
  category: ResearchSourceCategory,
): ResearchResultItem[] {
  const primarySource: ResearchUsedSource =
    usedSources[0] ?? { domain: "unknown", name: "Unknown" };

  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const items: ResearchResultItem[] = [];
  let currentHeadline: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeadline) return;
    const sourceLine = currentLines.find((l) =>
      l.toLowerCase().startsWith("kaynak:"),
    );
    const domain = sourceLine
      ? sourceLine.replace(/^kaynak:\s*/i, "").split("|")[0].trim()
      : null;
    const matchedSource =
      (domain
        ? usedSources.find((s) => s.domain === domain || s.url?.includes(domain))
        : null) ?? primarySource;

    items.push({
      headline: currentHeadline,
      summary: currentLines.join(" "),
      category,
      primarySource: matchedSource,
    });
    currentHeadline = null;
    currentLines = [];
  };

  for (const line of lines) {
    const numbered = line.match(/^\d+\.\s+(.+)/);
    if (numbered) {
      flush();
      const parts = numbered[1].split("|");
      currentHeadline = parts[0].trim();
      currentLines = [line];
    } else if (currentHeadline) {
      currentLines.push(line);
    }
  }
  flush();

  // Hiç yapısal öğe ayrıştırılamadıysa içeriği tek öğe olarak sakla
  if (items.length === 0 && content.trim()) {
    items.push({
      headline: content.slice(0, 120).trim(),
      summary: content,
      category,
      primarySource,
    });
  }

  return items;
}

// ─── Güven Hesaplama ──────────────────────────────────────────────────────────

function calculateBatchConfidenceScore(citationCount: number): number {
  if (citationCount >= 5) return 0.92;
  if (citationCount >= 3) return 0.82;
  if (citationCount >= 1) return 0.65;
  return 0.30;
}

function calculateOverallConfidenceScore(batches: ResearchBatchResult[]): number {
  if (batches.length === 0) return 0.30;
  const scores = batches.map((b) => b.confidenceScore);
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

function scoreToLevel(score: number): ResearchConfidenceLevel {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.50) return "MEDIUM";
  return "LOW";
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function buildEmptyBatch(
  tier: ResearchTier,
  query: string,
  researchedAt: string,
): ResearchBatchResult {
  return {
    tier,
    query,
    items: [],
    usedSources: [],
    sourceCount: 0,
    confidenceLevel: "LOW",
    confidenceScore: 0.20,
    researchedAt,
    rawContent: null,
  };
}
