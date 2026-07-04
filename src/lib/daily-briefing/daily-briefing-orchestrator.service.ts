import { runDailyResearch } from "@/lib/research-director/research-director.service";
import { buildDailyBriefingPackage } from "./daily-briefing-engine.service";
import { storeDailyBriefing } from "./daily-briefing-storage.service";
import { createMissingMemoryCandidates } from "@/lib/memory/candidate-engine.service";
import { buildExecutiveOperatingContext } from "@/lib/executive-operating-context";
import { composeExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type RunBriefingOrchestrationInput = {
  organizationId: string;
  isWeeklyDay?: boolean;
  companyContext?: string | null;
};

export type RunBriefingOrchestrationResult = {
  briefingDate: string;
  criticalCount: number;
  watchCount: number;
  infoCount: number;
  sourceCount: number;
  memoryWriteCount: number;
  wasAlreadyStored: boolean;
};

// ─── Ana Fonksiyon ────────────────────────────────────────────────────────────

export async function runBriefingOrchestration(
  input: RunBriefingOrchestrationInput,
): Promise<RunBriefingOrchestrationResult> {
  const { organizationId, isWeeklyDay, companyContext } = input;

  // 1) Araştırma
  const rawPackage = await runDailyResearch({
    organizationId,
    isWeeklyDay,
    companyContext,
  });

  // 2) Paket oluşturma + bellek adayları hazırlama
  const { briefingPackage, memoryCandidates, summary } = buildDailyBriefingPackage({
    rawPackage,
    organizationId,
    companyContext,
  });

  const operatingContext = await buildExecutiveOperatingContext({
    organizationId,
    mode: "BRIEFING",
    writePolicy: {
      syncCollectionActions: false,
      writeSignalSnapshot: false,
      writeDecisionRecords: false,
      syncPriorityActions: true,
    },
  });

  const executiveDailyBriefingV2 = composeExecutiveDailyBriefingV2({
    organizationId,
    briefingDate: briefingPackage.briefingDate,
    briefingPackage,
    operatingContext,
  });

  // 3) DB'ye kaydet (duplicate-safe)
  const storeResult = await storeDailyBriefing({
    organizationId,
    briefingPackage,
    summary,
    executiveDailyBriefingV2,
  });

  // 4) Bellek adaylarını yaz — non-fatal
  let memoryWriteCount = 0;
  if (!storeResult.wasAlreadyStored && memoryCandidates.length > 0) {
    try {
      const memResult = await createMissingMemoryCandidates({
        organizationId,
        candidates: memoryCandidates,
      });
      memoryWriteCount = memResult.created.length;
    } catch {
      // Bellek yazma hatası briefing'i engellemez
    }
  }

  return {
    briefingDate:   briefingPackage.briefingDate,
    criticalCount:  briefingPackage.kritikItems.length,
    watchCount:     briefingPackage.dikkatItems.length,
    infoCount:      briefingPackage.bilgiItems.length,
    sourceCount:    briefingPackage.sourceCount,
    memoryWriteCount,
    wasAlreadyStored: storeResult.wasAlreadyStored,
  };
}
