import { MemoryItemSource, MemoryItemType, MemorySubjectType } from "@prisma/client";

import {
  analyzeBriefingImpact,
  extractUsedSourcesFromImpacts,
} from "./briefing-impact-analyzer.service";
import { getIstanbulDateString } from "@/lib/signal-persistence/executive-signal-snapshot.service";

import type { MemoryCandidateDescriptor } from "@/lib/memory/candidate-engine.types";
import type {
  BriefingPackage,
  BriefingPriority,
  BuildBriefingPackageInput,
  NewsImpact,
} from "./daily-briefing.types";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const MAX_BILGI_ITEMS = 3;
const STRATEGIC_MEMORY_THRESHOLD = 0.80;
const BRIEFING_TIMEZONE = "Europe/Istanbul";

// ─── Dış Tipler ───────────────────────────────────────────────────────────────

export type BriefingDailySummary = {
  date: string;
  timezone: string;
  criticalCount: number;
  watchCount: number;
  infoCount: number;
  totalSourceCount: number;
  confidenceLevel: string;
  executiveSummary: string;
};

export type BuildDailyBriefingResult = {
  briefingPackage: BriefingPackage;
  memoryCandidates: MemoryCandidateDescriptor[];
  summary: BriefingDailySummary;
};

// ─── Ana Fonksiyon ────────────────────────────────────────────────────────────

export function buildDailyBriefingPackage(
  input: BuildBriefingPackageInput,
): BuildDailyBriefingResult {
  const impacts = analyzeBriefingImpact(input);

  const kritikItems = sortByImpact(impacts.filter((i) => i.priority === "KRITIK"));
  const dikkatItems = sortByImpact(impacts.filter((i) => i.priority === "DIKKAT"));
  const bilgiItems  = sortByImpact(impacts.filter((i) => i.priority === "BILGI")).slice(0, MAX_BILGI_ITEMS);

  const allItems   = [...kritikItems, ...dikkatItems, ...bilgiItems];
  const usedSources = extractUsedSourcesFromImpacts(allItems);
  const briefingDate = resolveBriefingDate();

  const memoryCandidates = buildMemoryCandidates(kritikItems, dikkatItems, briefingDate);

  const briefingPackage: BriefingPackage = {
    organizationId:        input.organizationId,
    generatedAt:           input.rawPackage.generatedAt,
    briefingDate,
    kritikItems,
    dikkatItems,
    bilgiItems,
    totalItems:            allItems.length,
    usedSources,
    sourceCount:           usedSources.length,
    overallConfidenceLevel: input.rawPackage.overallConfidenceLevel,
    overallConfidenceScore: input.rawPackage.overallConfidenceScore,
    memoryWriteCount:      memoryCandidates.length,
  };

  const summary = buildDailySummary(briefingPackage, briefingDate);

  return { briefingPackage, memoryCandidates, summary };
}

// ─── Sıralama ─────────────────────────────────────────────────────────────────

function sortByImpact(items: NewsImpact[]): NewsImpact[] {
  return [...items].sort((a, b) => b.impact_score - a.impact_score);
}

// ─── Tarih ────────────────────────────────────────────────────────────────────

function resolveBriefingDate(): string {
  return getIstanbulDateString();
}

function formatTurkishDate(isoDate: string): string {
  try {
    const date = new Date(`${isoDate}T07:00:00`);
    return date.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
      timeZone: BRIEFING_TIMEZONE,
    });
  } catch {
    return isoDate;
  }
}

// ─── Memory Candidate Hazırlığı ───────────────────────────────────────────────

function buildMemoryCandidates(
  kritikItems: NewsImpact[],
  dikkatItems: NewsImpact[],
  briefingDate: string,
): MemoryCandidateDescriptor[] {
  const candidates: MemoryCandidateDescriptor[] = [];

  const eligibleKritik = kritikItems.filter(
    (i) => i.strategic_relevance >= STRATEGIC_MEMORY_THRESHOLD,
  );
  const eligibleDikkat = dikkatItems.filter(
    (i) => i.strategic_relevance >= STRATEGIC_MEMORY_THRESHOLD,
  );

  for (const item of eligibleKritik) {
    candidates.push(buildSingleCandidate(item, "KRITIK", briefingDate));
  }

  for (const item of eligibleDikkat) {
    candidates.push(buildSingleCandidate(item, "DIKKAT", briefingDate));
  }

  return candidates;
}

function buildSingleCandidate(
  item: NewsImpact,
  priority: Extract<BriefingPriority, "KRITIK" | "DIKKAT">,
  briefingDate: string,
): MemoryCandidateDescriptor {
  const key = resolveMemoryKey(item, briefingDate);
  const value = item.headline.slice(0, 200).trim();
  const confidence = Math.round(item.strategic_relevance * 100);

  return {
    subjectType:   MemorySubjectType.ORGANIZATION,
    proposedType:  priority === "KRITIK" ? MemoryItemType.STRATEGIC : MemoryItemType.FACT,
    proposedKey:   key,
    proposedValue: value,
    source:        MemoryItemSource.SYSTEM_INFERRED,
    confidence,
    isAssumption:  false,
    reason:        `Sabah brifinginden ${priority === "KRITIK" ? "kritik" : "dikkat gerektiren"} ekonomik gelişme (${briefingDate}).`,
  };
}

function resolveMemoryKey(item: NewsImpact, date: string): string {
  const category = item.primarySource.domain ?? "gelisme";

  switch (item.ekonomik_etki.yon === "NOTR" ? item.finansal_etki.yon : item.ekonomik_etki.yon) {
    case "NEGATIF": return `negatif_gelisme_${date}_${shortenDomain(category)}`;
    case "POZITIF": return `pozitif_gelisme_${date}_${shortenDomain(category)}`;
    default:        return `ekonomik_gelisme_${date}_${shortenDomain(category)}`;
  }
}

function shortenDomain(domain: string): string {
  return domain.replace(/\.(com|gov|org|net|tr)(\.tr)?$/, "").replace(/[^a-z0-9]/gi, "_").slice(0, 20);
}

// ─── Günlük Özet ─────────────────────────────────────────────────────────────

function buildDailySummary(
  pkg: BriefingPackage,
  briefingDate: string,
): BriefingDailySummary {
  const turkishDate = formatTurkishDate(briefingDate);

  return {
    date:             turkishDate,
    timezone:         BRIEFING_TIMEZONE,
    criticalCount:    pkg.kritikItems.length,
    watchCount:       pkg.dikkatItems.length,
    infoCount:        pkg.bilgiItems.length,
    totalSourceCount: pkg.sourceCount,
    confidenceLevel:  pkg.overallConfidenceLevel,
    executiveSummary: buildExecutiveSummary(pkg, turkishDate),
  };
}

function buildExecutiveSummary(pkg: BriefingPackage, turkishDate: string): string {
  const kritikCount = pkg.kritikItems.length;
  const dikkatCount = pkg.dikkatItems.length;

  if (kritikCount === 0 && dikkatCount === 0) {
    return `${turkishDate} itibarıyla dikkat gerektiren kritik bir ekonomik gelişme tespit edilmedi. Günlük rutin planlarınıza devam edebilirsiniz.`;
  }

  const parts: string[] = [];

  if (kritikCount === 1) {
    const top = pkg.kritikItems[0];
    parts.push(`Bu sabah 1 kritik gelişme var: "${top.headline}"`);
    parts.push(`Önerin: ${top.yonetim_onerisi}`);
  } else if (kritikCount >= 2) {
    const top = pkg.kritikItems[0];
    parts.push(`Bu sabah ${kritikCount} kritik gelişme var.`);
    parts.push(`En önemlisi: "${top.headline}"`);
    parts.push(`Önerin: ${top.yonetim_onerisi}`);
  }

  if (dikkatCount > 0) {
    parts.push(`Ek olarak ${dikkatCount} dikkat gerektiren gelişme mevcut.`);
  }

  if (pkg.sourceCount > 0) {
    parts.push(`Brifing ${pkg.sourceCount} kaynaktan derlendi.`);
  }

  return parts.join(" ");
}
