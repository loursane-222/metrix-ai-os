import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const host = readFileSync(fileURLToPath(new URL("./ExecutiveNavigationCommandHost.tsx", import.meta.url)), "utf8");
const layout = readFileSync(fileURLToPath(new URL("../../app/metrix/layout.tsx", import.meta.url)), "utf8");

describe("ExecutiveNavigationCommandHost ownership", () => {
  it("is the single layout-lifetime Next router owner", () => {
    expect(layout).toContain("<ExecutiveNavigationCommandHost />");
    expect(host).toContain("registerExecutiveNavigationHandler");
    expect(host).toContain("usePathname");
    expect(host).toContain("acknowledgeRoute");
  });

  it("registers a stable handler without capturing pathname in the effect lifecycle", () => {
    expect(host).toContain("const pathnameRef = useRef(pathname)");
    expect(host).toContain("normalizePathname(pathnameRef.current)");
    expect(host).toContain("}), [router]);");
    expect(host).not.toContain("}), [pathname, router]);");
  });

  it("republishes the Calendar directive when a new request changes its view/date, even if already presented", () => {
    // Regression guard: without this, a second calendar-view-changing command
    // (e.g. "Bu ayı göster" then "Yarınki programımı göster" without closing
    // Calendar) skips republishing under the "already open" optimization —
    // the new directive's correlationId then never matches
    // LivingWorkspaceHost's navigationCommand.correlationId, completePresented()
    // never fires, and the command hangs until its 10s expiry. Reproduced live
    // and fixed by only allowing the skip when Calendar's view/date is unchanged.
    expect(host).toContain("calendarRefinementChanged");
    expect(host).toContain("current.calendarView !== directive.calendarView || current.calendarFocusDate !== directive.calendarFocusDate");
    expect(host).toContain("const alreadyPresented = sameTarget && !calendarRefinementChanged;");
  });
});
