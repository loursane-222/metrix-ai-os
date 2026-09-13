import { describe, expect, it } from "vitest";

import {
  METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS,
  buildMetrixExecutiveBackendInstructions
} from "../../src/lib/agent/metrix-executive-contract";

describe("shared METRIX executive backend contract", () => {
  it("publishes the authoritative verification and authority instructions", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("VERIFIED");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("Actor, organization");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("Do not claim");
  });

  it("appends trusted temporal context to the shared instructions", () => {
    expect(buildMetrixExecutiveBackendInstructions({
      timezone: "Europe/Istanbul",
      referenceTimeIso: "2026-09-13T17:30:00.000Z"
    })).toContain("2026-09-13T17:30:00.000Z");
  });
});
