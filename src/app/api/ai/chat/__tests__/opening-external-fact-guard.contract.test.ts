import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/app/api/ai/chat/route.ts"), "utf8");

// Regression: the disposable opening-phase filler (Character Reality 4db9956
// — never authoritative, always replaced by the canonical evidence-backed
// primary answer) was observed inventing a specific-sounding value for a
// freshness-sensitive external fact before Phase C evidence had even been
// retrieved (e.g. "yaklaşık 4 saat" for a route duration, ahead of the real
// OSRM-backed answer). The prior rule only forbade inventing names/numbers
// "not in the message" and verdicts/results in general — it never named
// live-evidence-dependent external facts (currency, weather, routes,
// traffic, place status, current news) as their own forbidden category, so
// the model still slipped a plausible guess through for this class of
// question. Fixed with one additional, explicit instruction in the same
// opening prompt block — no new classifier, no tool call, no second LLM
// pass, no change to the primary/canonical answer path.
describe("opening phase — external-fact guard (no invented current values before evidence)", () => {
  it("forbids the opening phase from asserting a concrete external-world value before evidence arrives", () => {
    const promptStart = source.indexOf("AYNI TURUN DİNAMİK AÇILIŞ PARÇASI");
    expect(promptStart).toBeGreaterThan(0);
    const promptEnd = source.indexOf("].join(\"\\n\");", promptStart);
    const promptBody = source.slice(promptStart, promptEnd);

    // Names the freshness-sensitive external-fact categories this guard
    // covers — not exhaustive keyword matching on one sentence, but proof
    // the instruction actually enumerates the risk categories from the
    // regression report (currency, weather, route/duration, traffic, place
    // status, current news/company developments).
    expect(promptBody).toContain("canlı kanıt gerektiren");
    expect(promptBody).toContain("döviz kuru");
    expect(promptBody).toContain("hava durumu");
    expect(promptBody).toContain("mesafe/süre/rota");
    expect(promptBody).toContain("trafik");
    expect(promptBody).toContain("güncel haber");

    // The instruction must forbid producing a value, never merely suggest
    // caution — "ASLA üretme" is the same hard-prohibition phrasing already
    // used elsewhere in this block for the no-topic case.
    expect(promptBody).toMatch(/somut bir DEĞER,[^.]*ASLA üretme/);

    // Acknowledging the task/topic (process language) must remain explicitly
    // allowed — this guard narrows what the opening may assert, it must not
    // silence it entirely (that would just reproduce the no-topic case for
    // every external-fact question).
    expect(promptBody).toContain("Yalnızca konuyu/eylemi adlandır");
  });

  it("keeps the guard inside the disposable opening block, not the canonical primary prompt", () => {
    const promptStart = source.indexOf("AYNI TURUN DİNAMİK AÇILIŞ PARÇASI");
    const guardIndex = source.indexOf("canlı kanıt gerektiren");
    const promptEnd = source.indexOf("].join(\"\\n\");", promptStart);
    expect(guardIndex).toBeGreaterThan(promptStart);
    expect(guardIndex).toBeLessThan(promptEnd);
  });
});
