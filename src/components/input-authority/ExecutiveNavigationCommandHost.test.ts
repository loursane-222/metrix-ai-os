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
});
