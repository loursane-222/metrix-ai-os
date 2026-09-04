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
    expect(host).toContain("const alreadyPresented = sameTarget && !calendarRefinementChanged && !companySectionChanged;");
  });

  it("republishes the Company directive when a new request changes its section, even if already presented", () => {
    // Same reasoning and same regression class as the Calendar guard above,
    // for Company's single Şirketim surface: "Entegrasyonları aç" while
    // already on the Genel Bakış tab of an already-open Şirketim surface
    // must still republish (switch tabs), not silently no-op under the
    // "already open" optimization.
    expect(host).toContain("companySectionChanged");
    expect(host).toContain("current.companySection !== directive.companySection");
  });

  it("retargets the correlationId of any already-presented surface instead of only skipping the republish", () => {
    // Regression guard: the Calendar fix above only closed the hang for
    // Calendar's own re-navigation-to-open-surface case. Every other domain
    // (customer, offer, order, stock, ...) still skipped the republish
    // outright, leaving the presented directive's correlationId stuck on the
    // previous turn — LivingWorkspaceHost's completePresented() guard
    // (navigationCommand.correlationId === directive.correlationId) could
    // never match, so a follow-up question about an already-open record
    // always hung to its 10s EXPIRED fallback sentence, same symptom as the
    // Calendar case, in every other domain. Fixed by re-stamping the
    // existing directive's correlationId via retarget() instead of skipping
    // outright.
    expect(host).toContain("if (alreadyPresented) livingWorkspaceRuntime.retarget(directive.correlationId);");
    expect(host).toContain("else livingWorkspaceRuntime.publish(directive);");
  });
});
