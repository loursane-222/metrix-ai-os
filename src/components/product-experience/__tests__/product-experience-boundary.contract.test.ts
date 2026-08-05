import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const host = readFileSync(resolve(process.cwd(), "src/components/input-authority/ExecutiveNavigationCommandHost.tsx"), "utf8");
const composition = readFileSync(resolve(process.cwd(), "src/app/metrix-onboarding-app.tsx"), "utf8");
const experienceHost = readFileSync(resolve(process.cwd(), "src/components/product-experience/ProductExperienceHost.tsx"), "utf8");
const detailRoute = readFileSync(resolve(process.cwd(), "src/app/metrix/customers/[customerId]/page.tsx"), "utf8");
const createRoute = readFileSync(resolve(process.cwd(), "src/app/metrix/customers/new/page.tsx"), "utf8");

describe("Product Experience migration boundary", () => {
  it("selects the Product Experience consumer before legacy Workspace publication", () => {
    expect(host.indexOf("claimProductExperienceCommand")).toBeLessThan(host.indexOf("livingWorkspaceRuntime.publish"));
    expect(host).toContain("if (resolveProductExperienceTarget(command)) return;");
  });

  it("keeps one conversation instance mounted while visibility changes", () => {
    expect(composition).toContain("conversation={<MetrixTabScreen />}");
    expect(experienceHost).toContain("inert={!conversationVisible ? true : undefined}");
    expect(experienceHost).toContain("{conversation}</section>");
    expect(experienceHost).not.toContain("router.push");
    expect(experienceHost).not.toContain("livingWorkspaceRuntime");
  });

  it("preserves direct deep-link route screens", () => {
    expect(detailRoute).toContain("<CustomerDetailScreen customerId={customerId} />");
    expect(createRoute).toContain("<CustomerCreateScreen />");
  });
});
