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
});
