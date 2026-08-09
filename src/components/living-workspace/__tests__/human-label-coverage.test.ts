import { describe, expect, it } from "vitest";
import { humanLabel } from "../human-label";
import { DOMAIN_RULES } from "@/lib/living-workspace/contracts";
import { DOMAIN_SURFACE_ADAPTERS } from "@/lib/living-workspace/domain-adapters";

const DERIVED_METRICS = new Set(["count", "activeCount", "openCount", "overdueCount", "depletedStockCount"]);
const EXPLICIT_LABELS_EQUAL_TO_FALLBACK = new Set(["lot"]);

describe("Living Workspace Turkish label coverage", () => {
  it("has an explicit label for every canonical field and non-derived summary metric", () => {
    const keys = new Set<string>();

    for (const rules of Object.values(DOMAIN_RULES)) {
      for (const field of rules.fields) keys.add(field);
    }
    for (const adapter of Object.values(DOMAIN_SURFACE_ADAPTERS)) {
      for (const field of adapter.fieldRegistry) keys.add(field);
      for (const metric of adapter.summaryMetrics) {
        if (!DERIVED_METRICS.has(metric)) keys.add(metric);
      }
    }

    for (const key of keys) {
      const fallback = key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
      if (EXPLICIT_LABELS_EQUAL_TO_FALLBACK.has(key)) expect(humanLabel(key)).toBe("Lot");
      else expect(humanLabel(key), `Missing explicit Turkish label for "${key}"`).not.toBe(fallback);
    }
  });
});
