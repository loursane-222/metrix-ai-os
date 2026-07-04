import type {
  ResearchResultItem,
  ResearchSourceCategory,
  ResearchUsedSource,
} from "@/lib/research-director/research-director.types";

import type {
  BriefingPriority,
  BuildBriefingPackageInput,
  ImpactAxis,
  ImpactDirection,
  ImpactMagnitude,
  NewsImpact,
} from "./daily-briefing.types";

// ─── Filtre: İş Dışı İçerik ──────────────────────────────────────────────────

const NON_BUSINESS_KEYWORDS: string[] = [
  // Spor
  "futbol", "basketbol", "voleybol", "tenis", "golf", "yüzme", "atletizm",
  "maç sonucu", "maç skoru", "şampiyonluk", "lig tablosu", "deplasman",
  "golcü", "kaleci", "forvet", "savunma oyuncusu", "transfer haberi",
  // Magazin ve eğlence
  "magazin", "dizi yayın", "film gösterim", "sinema", "konser bilet",
  "oyuncu hayatı", "şarkıcı", "müzisyen albüm", "sanatçı",
  "moda haftası", "güzellik yarışması", "kozmetik trend",
  // Dedikodu ve sosyal
  "çift oldu", "ayrıldı", "evlendi", "boşandı", "bebeği oldu",
  "ünlü tatil", "yemek tarifi", "seyahat rehberi",
];

// ─── Kategori Bazlı Taban Skorlar ────────────────────────────────────────────

type AxisBaseline = {
  ekonomik: number;
  finansal: number;
  satis: number;
  operasyonel: number;
  strategicRelevance: number;
};

const CATEGORY_BASELINE: Record<ResearchSourceCategory, AxisBaseline> = {
  TR_ECONOMY:           { ekonomik: 0.75, finansal: 0.70, satis: 0.55, operasyonel: 0.45, strategicRelevance: 0.75 },
  GLOBAL_ECONOMY:       { ekonomik: 0.60, finansal: 0.55, satis: 0.45, operasyonel: 0.38, strategicRelevance: 0.60 },
  OFFICIAL_INSTITUTION: { ekonomik: 0.80, finansal: 0.80, satis: 0.40, operasyonel: 0.42, strategicRelevance: 0.85 },
  MANAGEMENT_STRATEGY:  { ekonomik: 0.35, finansal: 0.28, satis: 0.65, operasyonel: 0.70, strategicRelevance: 0.55 },
  RESEARCH_DATA:        { ekonomik: 0.55, finansal: 0.48, satis: 0.45, operasyonel: 0.45, strategicRelevance: 0.50 },
  GENERAL_NEWS:         { ekonomik: 0.38, finansal: 0.32, satis: 0.35, operasyonel: 0.28, strategicRelevance: 0.35 },
};

// ─── Yön Keyword Sözlükleri ───────────────────────────────────────────────────

type KeywordSignal = { keywords: string[]; direction: ImpactDirection; weight: number };

const EKONOMIK_SIGNALS: KeywordSignal[] = [
  { direction: "NEGATIF", weight: 0.90, keywords: ["resesyon", "ekonomik kriz", "çöküş", "durgunluk", "iflas dalgası"] },
  { direction: "NEGATIF", weight: 0.70, keywords: ["daralma", "yavaşlama", "büyüme düştü", "ekonomi geriledi", "istihdam azaldı"] },
  { direction: "NEGATIF", weight: 0.50, keywords: ["ekonomik belirsizlik", "büyüme riski", "ekonomik baskı", "ekonomik yavaş"] },
  { direction: "POZITIF", weight: 0.90, keywords: ["güçlü büyüme", "ekonomik patlama", "rekor büyüme", "ekonomik canlanma"] },
  { direction: "POZITIF", weight: 0.70, keywords: ["büyüme arttı", "ekonomi büyüdü", "istihdam arttı", "üretim arttı", "ihracat rekoru"] },
  { direction: "POZITIF", weight: 0.50, keywords: ["ekonomik toparlanma", "iyileşme", "büyüme beklenti", "ekonomik istikrar"] },
];

const FINANSAL_SIGNALS: KeywordSignal[] = [
  { direction: "NEGATIF", weight: 0.90, keywords: ["faiz arttı", "faiz yükseldi", "merkez bankası faiz artış", "tcmb faiz artış", "dolar yükseldi", "euro yükseldi", "kur yükseldi", "döviz kriz"] },
  { direction: "NEGATIF", weight: 0.70, keywords: ["enflasyon yükseldi", "enflasyon arttı", "maliyet arttı", "zarar açıkladı", "bütçe açığı", "borç yükü", "kredi faiz arttı"] },
  { direction: "NEGATIF", weight: 0.50, keywords: ["piyasa düştü", "borsa geriledi", "finansal baskı", "nakit sıkışıklığı"] },
  { direction: "POZITIF", weight: 0.90, keywords: ["faiz düştü", "faiz indirim", "enflasyon geriledi", "dolar geriledi", "kur düştü", "döviz istikrar"] },
  { direction: "POZITIF", weight: 0.70, keywords: ["kâr açıkladı", "kârlılık arttı", "bütçe fazlası", "borç azaldı", "piyasa yükseldi", "borsa rekor"] },
  { direction: "POZITIF", weight: 0.50, keywords: ["finansal iyileşme", "kredi ucuzladı", "maliyet düştü", "vergi kolaylığı"] },
];

const SATIS_SIGNALS: KeywordSignal[] = [
  { direction: "NEGATIF", weight: 0.90, keywords: ["talep çöktü", "satış kriz", "tüketici güveni çöktü", "müşteri kaybı büyük"] },
  { direction: "NEGATIF", weight: 0.70, keywords: ["talep düştü", "satış düştü", "tüketim azaldı", "alım gücü düştü", "iç talep geriledi"] },
  { direction: "NEGATIF", weight: 0.50, keywords: ["satış baskı", "rekabet arttı", "fiyat baskısı", "pazar daralması"] },
  { direction: "POZITIF", weight: 0.90, keywords: ["talep patladı", "satış rekoru", "ihracat rekoru", "büyük sipariş", "pazar lideri"] },
  { direction: "POZITIF", weight: 0.70, keywords: ["talep arttı", "satış arttı", "ihracat arttı", "tüketim arttı", "alım gücü arttı", "tüketici güveni arttı"] },
  { direction: "POZITIF", weight: 0.50, keywords: ["yeni pazar", "pazar büyüdü", "müşteri tabanı genişledi", "dijital kanal büyüdü"] },
];

const OPERASYONEL_SIGNALS: KeywordSignal[] = [
  { direction: "NEGATIF", weight: 0.90, keywords: ["tedarik krizi", "lojistik kriz", "enerji krizi", "üretim durdu", "fabrika kapandı"] },
  { direction: "NEGATIF", weight: 0.70, keywords: ["tedarik sorunu", "lojistik sorun", "enerji zammı", "hammadde kıtlığı", "işgücü sıkıntısı", "nakliye maliyeti arttı"] },
  { direction: "NEGATIF", weight: 0.50, keywords: ["aksaklık", "gecikme", "kapasite sorunu", "operasyonel baskı", "regülasyon artış"] },
  { direction: "POZITIF", weight: 0.90, keywords: ["tedarik normalleşti", "lojistik iyileşti", "enerji ucuzladı", "üretim kapasitesi arttı"] },
  { direction: "POZITIF", weight: 0.70, keywords: ["verimlilik arttı", "maliyet düştü", "tedarik kolaylaştı", "enerji maliyeti düştü", "nakliye ucuzladı"] },
  { direction: "POZITIF", weight: 0.50, keywords: ["otomasyon", "dijitalleşme", "süreç iyileştirme", "yeni teknoloji", "verimlilik kazanımı"] },
];

// ─── Magnitude → Score ────────────────────────────────────────────────────────

const MAGNITUDE_SCORE: Record<ImpactMagnitude, number> = {
  YUKSEK: 0.85,
  ORTA:   0.60,
  DUSUK:  0.35,
};

const DIRECTION_SCORE_NOTR = 0.15;

// ─── Ağırlıklar ───────────────────────────────────────────────────────────────

const AXIS_WEIGHTS = {
  ekonomik:    0.30,
  finansal:    0.30,
  satis:       0.22,
  operasyonel: 0.18,
} as const;

// ─── Ana Servis ───────────────────────────────────────────────────────────────

export function analyzeBriefingImpact(
  input: BuildBriefingPackageInput,
): NewsImpact[] {
  const results: NewsImpact[] = [];

  for (const batch of input.rawPackage.batches) {
    for (const item of batch.items) {
      if (isNonBusinessContent(item)) continue;

      try {
        const impact = buildNewsImpact(item, batch.confidenceScore);
        results.push(impact);
      } catch {
        // Crash etme — item'ı atla
      }
    }
  }

  return results;
}

// ─── Filtre ───────────────────────────────────────────────────────────────────

function isNonBusinessContent(item: ResearchResultItem): boolean {
  const normalized = (item.headline + " " + item.summary).toLowerCase();
  return NON_BUSINESS_KEYWORDS.some((kw) => normalized.includes(kw));
}

// ─── Etki Üretici ─────────────────────────────────────────────────────────────

function buildNewsImpact(
  item: ResearchResultItem,
  batchConfidence: number,
): NewsImpact {
  const normalized = (item.headline + " " + item.summary).toLowerCase();
  const baseline = CATEGORY_BASELINE[item.category];
  const confidenceModifier = Math.max(0.40, batchConfidence);

  const ekonomik   = resolveAxis(normalized, EKONOMIK_SIGNALS,    baseline.ekonomik,    confidenceModifier, "ekonomik");
  const finansal   = resolveAxis(normalized, FINANSAL_SIGNALS,     baseline.finansal,    confidenceModifier, "finansal");
  const satis      = resolveAxis(normalized, SATIS_SIGNALS,        baseline.satis,       confidenceModifier, "satis");
  const operasyonel = resolveAxis(normalized, OPERASYONEL_SIGNALS, baseline.operasyonel, confidenceModifier, "operasyonel");

  const impactScore = calculateImpactScore(ekonomik, finansal, satis, operasyonel);
  const strategicRelevance = calculateStrategicRelevance(
    item.category,
    baseline.strategicRelevance,
    impactScore,
    batchConfidence,
  );

  const priority = resolvePriority(impactScore);

  return {
    headline:     item.headline,
    summary:      item.summary,
    publishedAt:  item.publishedAt ?? null,
    primarySource: item.primarySource,
    ekonomik_etki:    ekonomik,
    operasyonel_etki: operasyonel,
    satis_etkisi:     satis,
    finansal_etki:    finansal,
    yonetim_onerisi:  buildYonetimOnerisi(ekonomik, finansal, satis, operasyonel, priority),
    impact_score:      round(impactScore),
    strategic_relevance: round(strategicRelevance),
    priority,
  };
}

// ─── Eksen Çözücü ────────────────────────────────────────────────────────────

function resolveAxis(
  normalized: string,
  signals: KeywordSignal[],
  baselineScore: number,
  confidenceModifier: number,
  axisLabel: string,
): ImpactAxis {
  let bestSignal: { direction: ImpactDirection; weight: number } | null = null;
  let matchCount = 0;

  for (const signal of signals) {
    const matches = signal.keywords.filter((kw) => normalized.includes(kw));
    if (matches.length === 0) continue;
    matchCount += matches.length;
    if (!bestSignal || signal.weight > bestSignal.weight) {
      bestSignal = { direction: signal.direction, weight: signal.weight };
    }
  }

  if (!bestSignal) {
    // Keyword eşleşmesi yok — kategori baseline'ına göre NOTR / DUSUK
    const baseMag: ImpactMagnitude = baselineScore >= 0.65 ? "ORTA" : "DUSUK";
    return {
      yon: "NOTR",
      buyukluk: baseMag,
      aciklama: buildNeutralExplanation(axisLabel, baseMag),
    };
  }

  const rawWeight = bestSignal.weight * confidenceModifier;
  const magnitude = resolveMagnitude(rawWeight, matchCount);

  return {
    yon: bestSignal.direction,
    buyukluk: magnitude,
    aciklama: buildDirectionalExplanation(axisLabel, bestSignal.direction, magnitude),
  };
}

function resolveMagnitude(weight: number, matchCount: number): ImpactMagnitude {
  const boosted = Math.min(weight + (matchCount - 1) * 0.08, 0.97);
  if (boosted >= 0.72) return "YUKSEK";
  if (boosted >= 0.48) return "ORTA";
  return "DUSUK";
}

// ─── Skor Hesaplama ──────────────────────────────────────────────────────────

function calculateImpactScore(
  ekonomik: ImpactAxis,
  finansal: ImpactAxis,
  satis: ImpactAxis,
  operasyonel: ImpactAxis,
): number {
  const score =
    axisContribution(ekonomik)    * AXIS_WEIGHTS.ekonomik +
    axisContribution(finansal)    * AXIS_WEIGHTS.finansal +
    axisContribution(satis)       * AXIS_WEIGHTS.satis +
    axisContribution(operasyonel) * AXIS_WEIGHTS.operasyonel;

  return Math.min(Math.max(score, 0.10), 0.97);
}

function axisContribution(axis: ImpactAxis): number {
  if (axis.yon === "NOTR") return DIRECTION_SCORE_NOTR;
  return MAGNITUDE_SCORE[axis.buyukluk];
}

function calculateStrategicRelevance(
  category: ResearchSourceCategory,
  baselineRelevance: number,
  impactScore: number,
  batchConfidence: number,
): number {
  const raw = baselineRelevance * 0.50 + impactScore * 0.35 + batchConfidence * 0.15;
  return Math.min(Math.max(raw, 0.10), 0.97);
}

// ─── Priority ────────────────────────────────────────────────────────────────

function resolvePriority(impactScore: number): BriefingPriority {
  if (impactScore >= 0.70) return "KRITIK";
  if (impactScore >= 0.45) return "DIKKAT";
  return "BILGI";
}

// ─── Yönetim Önerisi ─────────────────────────────────────────────────────────

function buildYonetimOnerisi(
  ekonomik: ImpactAxis,
  finansal: ImpactAxis,
  satis: ImpactAxis,
  operasyonel: ImpactAxis,
  priority: BriefingPriority,
): string {
  const dominant = findDominantAxis(ekonomik, finansal, satis, operasyonel);

  if (dominant.label === "finansal") {
    if (dominant.axis.yon === "NEGATIF" && dominant.axis.buyukluk === "YUKSEK")
      return "Nakit akışı ve kredi maliyetlerinizi bu gelişme ışığında CFO ile bu hafta değerlendirin.";
    if (dominant.axis.yon === "NEGATIF")
      return "Finansal planlarınızı gözden geçirin; maliyet ve nakit etkisini modelleyin.";
    if (dominant.axis.yon === "POZITIF" && dominant.axis.buyukluk === "YUKSEK")
      return "Bu finansal fırsatı değerlendirmek için kısa vadeli yatırım planlarınızı hızlandırın.";
    if (dominant.axis.yon === "POZITIF")
      return "Finansal koşullar iyileşiyor; kredi ve yatırım planlarınızı güncelleyin.";
  }

  if (dominant.label === "ekonomik") {
    if (dominant.axis.yon === "NEGATIF" && dominant.axis.buyukluk === "YUKSEK")
      return "Makroekonomik riski operasyonlarınıza yansımadan önce senaryo analizi yapın.";
    if (dominant.axis.yon === "NEGATIF")
      return "Ekonomik yavaşlama sinyalini takipte tutun; bütçe planlarınıza etki hesaplayın.";
    if (dominant.axis.yon === "POZITIF" && dominant.axis.buyukluk === "YUKSEK")
      return "Büyüme ortamından yararlanmak için pazar genişleme planlarınızı güncelleyin.";
    if (dominant.axis.yon === "POZITIF")
      return "Olumlu ekonomik sinyal; büyüme hedeflerinizi revize etmeyi değerlendirin.";
  }

  if (dominant.label === "satis") {
    if (dominant.axis.yon === "NEGATIF" && dominant.axis.buyukluk === "YUKSEK")
      return "Müşteri kaybını önlemek için satış stratejinizi ve fiyatlandırmanızı acilen gözden geçirin.";
    if (dominant.axis.yon === "NEGATIF")
      return "Satış baskısı için müşteri koruma ve fiyat stratejisi güncelleyin.";
    if (dominant.axis.yon === "POZITIF" && dominant.axis.buyukluk === "YUKSEK")
      return "Artan talebi karşılamak için satış kapasitesi ve stok planlamanızı güncelleyin.";
    if (dominant.axis.yon === "POZITIF")
      return "Talep artışı için satış ekibinizle kapasite ve hedef revizyonu yapın.";
  }

  if (dominant.label === "operasyonel") {
    if (dominant.axis.yon === "NEGATIF" && dominant.axis.buyukluk === "YUKSEK")
      return "Kritik tedarik zinciri alternatiflerini ve iş sürekliliği planınızı acilen gözden geçirin.";
    if (dominant.axis.yon === "NEGATIF")
      return "Operasyonel riske karşı tedarikçi ve lojistik alternatiflerinizi değerlendirin.";
    if (dominant.axis.yon === "POZITIF")
      return "Operasyonel iyileşmeden yararlanmak için verimlilik ve maliyet projelerinizi hızlandırın.";
  }

  if (priority === "KRITIK")
    return "Bu gelişmeyi yönetim ekibinizle acilen değerlendirin ve kısa vadeli aksiyon alın.";
  if (priority === "DIKKAT")
    return "Bu gelişmeyi ekibinizle paylaşın ve kısa vadeli etkisini değerlendirin.";
  return "Takipte kalın; gelişimin seyrini izleyin.";
}

type DominantAxisResult = {
  label: "ekonomik" | "finansal" | "satis" | "operasyonel";
  axis: ImpactAxis;
};

function findDominantAxis(
  ekonomik: ImpactAxis,
  finansal: ImpactAxis,
  satis: ImpactAxis,
  operasyonel: ImpactAxis,
): DominantAxisResult {
  const candidates: DominantAxisResult[] = [
    { label: "ekonomik",    axis: ekonomik },
    { label: "finansal",    axis: finansal },
    { label: "satis",       axis: satis },
    { label: "operasyonel", axis: operasyonel },
  ];

  const nonNotr = candidates.filter((c) => c.axis.yon !== "NOTR");
  const pool = nonNotr.length > 0 ? nonNotr : candidates;

  return pool.sort(
    (a, b) => MAGNITUDE_SCORE[b.axis.buyukluk] - MAGNITUDE_SCORE[a.axis.buyukluk],
  )[0];
}

// ─── Açıklama Üreticiler ─────────────────────────────────────────────────────

function buildDirectionalExplanation(
  axis: string,
  direction: ImpactDirection,
  magnitude: ImpactMagnitude,
): string {
  const mag = magnitude === "YUKSEK" ? "önemli ölçüde" : magnitude === "ORTA" ? "belirli ölçüde" : "sınırlı düzeyde";
  const dir = direction === "POZITIF" ? "olumlu etkileyebilir" : "olumsuz etkileyebilir";
  const labels: Record<string, string> = {
    ekonomik: "Makroekonomik konumunuzu",
    finansal: "Nakit akışı ve finansal maliyetlerinizi",
    satis: "Satış hacmi ve müşteri talebinizi",
    operasyonel: "Operasyonel süreçlerinizi ve tedarik zincirinizi",
  };
  return `${labels[axis] ?? "İş süreçlerinizi"} ${mag} ${dir}.`;
}

function buildNeutralExplanation(axis: string, magnitude: ImpactMagnitude): string {
  const mag = magnitude === "ORTA" ? "dolaylı" : "düşük";
  const labels: Record<string, string> = {
    ekonomik: "Makroekonomik",
    finansal: "Finansal",
    satis: "Satış",
    operasyonel: "Operasyonel",
  };
  return `${labels[axis] ?? "İş"} etkisi şu an ${mag} düzeyde görünüyor.`;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Kaynak Şeffaflığı Yardımcısı (Phase 5 için) ─────────────────────────────

export function extractUsedSourcesFromImpacts(
  impacts: NewsImpact[],
): ResearchUsedSource[] {
  const seen = new Set<string>();
  const sources: ResearchUsedSource[] = [];

  for (const impact of impacts) {
    const key = impact.primarySource.url ?? impact.primarySource.domain;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(impact.primarySource);
  }

  return sources;
}
