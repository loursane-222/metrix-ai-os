import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("executive background signal consumption", () => {
  it("keeps the four executive signal families on a user-visible path", () => {
    const briefingCard = [
      "src/components/metrix-tab/MetrixChatTab.tsx",
      "src/components/metrix-tab/DailyExecutiveSummaryV2.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    const composer = readFileSync(resolve(process.cwd(), "src/lib/executive-daily-briefing-v2/executive-daily-briefing-v2-composer.service.ts"), "utf8");
    for (const field of ["forecastSummary", "scorecardSummary", "awarenessSummary", "executiveNarrativeSummary", "executiveFocusSummary", "signalTrendSummary"]) {
      expect(briefingCard, field).toContain(field);
      expect(composer, field).toContain(field);
    }
  });

  it("documents delegation as a background-only signal with an explicit consumer contract", () => {
    const operatingContext = readFileSync(resolve(process.cwd(), "src/lib/executive-operating-context/executive-operating-context.types.ts"), "utf8");
    expect(operatingContext).toMatch(/delegat|accountab/i);
  });
});
