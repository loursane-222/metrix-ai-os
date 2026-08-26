import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Daily Executive Summary production fit contract", () => {
  const component = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/DailyExecutiveSummaryV2.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/DailyExecutiveSummaryV2.module.css"), "utf8");

  it("exposes stable browser geometry targets", () => {
    for (const target of ["data-summary-grid", "data-summary-card=\"attention\"", "data-summary-risk-row", "data-summary-section=\"quality\""]) {
      expect(component).toContain(target);
    }
  });

  it("keeps the right-column footer in content flow and columns inside the surface", () => {
    expect(css).toContain("grid-template-columns:minmax(0,31fr) minmax(0,37fr) minmax(0,32fr)");
    expect(css).toContain(".attention{display:flex;min-height:0;flex-direction:column}");
    expect(css).toContain(".quality{position:static;margin-top:auto");
    expect(css).not.toMatch(/\.quality\{[^}]*position:absolute/);
  });
});
