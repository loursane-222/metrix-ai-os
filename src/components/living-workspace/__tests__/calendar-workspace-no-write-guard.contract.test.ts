import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../CalendarWorkspace.tsx", import.meta.url), "utf8");

/**
 * J) No calendar WRITE capability accidentally introduced for non-native
 * calendar sources. Unified Calendar Truth adds Google-sourced events into
 * this same client-side event list (see /api/calendar-events's route.ts —
 * toWorkspaceCalendarItem tags them `provider: "GOOGLE"`); this proves the
 * client never lets a non-native row be dragged/reschedule-PATCHed, which
 * would otherwise silently attempt a write against an id that has no
 * native row to update.
 */
describe("CalendarWorkspace — no accidental write surface for non-native (Google) events", () => {
  it("marks an event draggable/reschedule-eligible only when it has no source provider tag", () => {
    expect(source).toContain("canonical: !row.provider");
  });

  it("still gates the actual drag-start/drop handlers on that same canonical flag — unchanged, pre-existing guard", () => {
    expect(source).toContain("draggable={entry.canonical}");
    expect(source).toContain("entry.canonical && event.dataTransfer.setData");
  });
});
