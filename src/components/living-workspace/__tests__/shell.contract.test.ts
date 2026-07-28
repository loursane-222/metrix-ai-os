import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
describe("Executive App Shell contracts", () => {
  const layout = read("src/app/metrix/layout.tsx");
  const shell = read("src/components/living-workspace/ExecutiveAppShell.tsx");
  const host = read("src/components/living-workspace/LivingWorkspaceHost.tsx");
  const adapters = read("src/lib/living-workspace/domain-adapters.ts");
  const tabs = read("src/components/metrix-tab/MetrixTabScreen.tsx");
  it("has one layout-lifetime shell, header and dock authority", () => {
    expect(layout.match(/<ExecutiveAppShell>/g)).toHaveLength(1);
    expect(shell.match(/function ExecutiveDock/g)).toHaveLength(1);
    expect(tabs).not.toMatch(/BottomNav|ExecutiveDock|PlaceholderTab/);
  });
  it("locks body-height behavior and reserves safe dock space with workspace scrolling", () => {
    expect(shell).toContain("h-[100dvh]");
    expect(shell).toContain("overflow-hidden");
    expect(shell).toContain("env(safe-area-inset-bottom)");
    expect(host).toContain("overflow-y-auto");
    expect(host).toContain("min-h-0");
  });
  it("keeps inline workspace router-free and uses canonical adapters", () => {
    expect(host).not.toContain("useRouter");
    expect(adapters).toContain('endpoint:"/api/company"');
    expect(adapters).toContain('endpoint:"/api/customers"');
    expect(adapters).toContain('endpoint:"/api/products"');
    expect(host).toContain("INSUFFICIENT_CANONICAL_CAPABILITY");
  });
  it("removes Product MetrixWorkspace demo authority", () => {
    expect(read("src/app/metrix/products/page.tsx")).not.toContain("MetrixWorkspace");
  });
});
