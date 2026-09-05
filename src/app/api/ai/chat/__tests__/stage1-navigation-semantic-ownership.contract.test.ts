import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../route.ts", import.meta.url),
  "utf8",
);

describe("Stage 1 — navigation semantic ownership", () => {
  it("deterministic navigation owns only a purely mechanical turn", () => {
    const start = route.indexOf(
      "const precomputedBusinessNavigationMessage =",
    );
    const end = route.indexOf(
      "const silentPreparation =",
      start,
    );

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const block = route.slice(start, end);

    expect(block).toContain(
      "!conversationUnderstanding.shouldInvokeExecutiveBrain",
    );

    expect(block).toContain(
      "!isInformationalCustomerLookup",
    );
  });

  it("keeps one canonical navigation message builder", () => {
    const occurrences = route
      .split(
        "buildBusinessNavigationMessage(businessNavigationPresentationEvidence, calendarClock)",
      )
      .length - 1;

    expect(occurrences).toBe(1);
  });
});
