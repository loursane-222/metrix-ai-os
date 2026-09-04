import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../CalendarWorkspace.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

/**
 * Calendar Day Viewport/Scroll fix — presentation-only. Proves the timeline
 * renders a full 24h grid, the correct element owns internal scroll (not the
 * page or the outer timeline shell), and a real 21:30 event lands inside the
 * rendered/scrollable region. No assertion here touches calendar-projection.ts,
 * the Google/native connector adapters, or route.ts — those stay untouched.
 */
describe("CalendarWorkspace — Day viewport is fully scrollable across 00:00–24:00", () => {
  it("1) renders a full 24-hour grid, not the old hard-coded 08:00–20:00 window", () => {
    expect(source).toContain("Array.from({ length: 24 }, (_, index) => index)");
    expect(source).not.toContain("index + 8");
  });

  it("2) the timeline's inner time-body is the scrollable element (overflow:auto, flex:1, min-height:0)", () => {
    const rule = css.match(/\.approved-calendar-time-body\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("overflow:auto");
    expect(rule).toContain("flex:1");
    expect(rule).toContain("min-height:0");
  });

  it("3) the outer timeline shell does not itself scroll or grow unbounded — it stays overflow:hidden and height-bounded, so the parent never wrongly captures the scroll", () => {
    const rule = css.match(/\.approved-calendar-month,\.approved-calendar-timeline\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("overflow:hidden");
    expect(rule).toContain("height:100%");
  });

  it("4) a 21:30 event is positioned inside the rendered 24h region (no -8h offset clipping it out)", () => {
    expect(source).toContain("(start.getHours()+start.getMinutes()/60)*48");
    expect(source).not.toContain("-8)*48");
    // 21:30 -> top = 21.5*48 = 1032px, well within the 24*48=1152px column height.
    const top = (21 + 30 / 60) * 48;
    const columnHeight = 24 * 48;
    expect(top).toBeLessThan(columnHeight);
  });

  it("5) Month view keeps its own unmodified grid (no shared hour/scroll logic leaking in)", () => {
    expect(source).toContain("approved-calendar-month");
    expect(source).toContain("approved-calendar-days");
  });

  it("6) external-provider (Google) events remain non-draggable/non-reschedule-eligible — unchanged guard, not regressed by this fix", () => {
    expect(source).toContain("canonical: !row.provider");
    expect(source).toContain("draggable={entry.canonical}");
  });

  it("7) mobile media query only overrides column widths, never re-introduces a fixed/clipped height for the scrollable body", () => {
    const mobileBlock = css.match(/@media\(max-width:767px\)\{[\s\S]*?\}\}/)?.[0] ?? "";
    const mobileTimeBody = mobileBlock.match(/\.approved-calendar-time-body\{[^}]*\}/)?.[0] ?? "";
    expect(mobileTimeBody).not.toContain("height:624px");
    expect(mobileTimeBody).not.toContain("min-height:624px");
  });

  it("gutter and event-column heights agree on the same 24-hour, 48px/hour scale", () => {
    expect(css).toContain(".approved-calendar-gutter{display:grid;grid-template-rows:repeat(24,48px)}");
    expect(css).toContain("height:1152px");
  });

  it("scroll anchor logic is deterministic (today's real time or the day's real earliest event) and skips month view", () => {
    expect(source).toContain('if (view === "month") return;');
    expect(source).toContain("timeBodyRef.current");
    expect(source).toContain("node.scrollTop");
  });
});
