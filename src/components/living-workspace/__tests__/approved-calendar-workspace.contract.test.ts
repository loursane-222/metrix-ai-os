import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const calendar = readFileSync(fileURLToPath(new URL("../CalendarWorkspace.tsx", import.meta.url)), "utf8");
const resolver = readFileSync(fileURLToPath(new URL("../BusinessSurfaceResolver.tsx", import.meta.url)), "utf8");

describe("Approved Calendar Workspace presentation contract", () => {
  it("keeps calendar on its special resolver branch", () => {
    expect(resolver).toContain('directive.businessSurface === "calendar"');
    expect(calendar).toContain("data-approved-calendar-workspace");
    expect(calendar).not.toContain("ApprovedDomainWorkspace");
  });

  it("preserves one existing Month/Week/Day state authority, now seedable from a canonical navigation request", () => {
    expect(calendar.match(/useState<"month" \| "week" \| "day">/g)?.length).toBe(1);
    expect(calendar).toContain('(["month","week","day"] as const)');
    // Two legitimate call sites: the manual tab switch, and the one-time seed
    // from an external navigation request (requestId-gated, see the effect
    // below) — both stay owned inside CalendarWorkspace, no parallel authority.
    expect(calendar.match(/setView\(/g)?.length).toBe(2);
    expect(calendar).toContain("appliedRequestRef");
  });

  it("preserves existing canonical loading and mutation handlers", () => {
    for (const token of ["BORROWED_SOURCES", "/api/calendar-events?rangeStart=", "sendCreate", "sendMove", "confirmConflict", "participants: memberIds", "registerCalendarConflictSurfaceTarget"]) expect(calendar).toContain(token);
  });
});
