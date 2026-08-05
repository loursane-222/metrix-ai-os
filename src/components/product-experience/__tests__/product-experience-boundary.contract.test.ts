import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const host = readFileSync(resolve(process.cwd(), "src/components/input-authority/ExecutiveNavigationCommandHost.tsx"), "utf8");
const composition = readFileSync(resolve(process.cwd(), "src/app/metrix-onboarding-app.tsx"), "utf8");
const experienceHost = readFileSync(resolve(process.cwd(), "src/components/product-experience/ProductExperienceHost.tsx"), "utf8");
const detailRoute = readFileSync(resolve(process.cwd(), "src/app/metrix/customers/[customerId]/page.tsx"), "utf8");
const detailRouteExperience = readFileSync(resolve(process.cwd(), "src/components/product-experience/CustomerDetailRouteExperience.tsx"), "utf8");
const createRoute = readFileSync(resolve(process.cwd(), "src/app/metrix/customers/new/page.tsx"), "utf8");

describe("Product Experience migration boundary", () => {
  it("selects the Product Experience consumer before legacy Workspace publication", () => {
    expect(host.indexOf("claimProductExperienceCommand")).toBeLessThan(host.indexOf("livingWorkspaceRuntime.publish"));
    expect(host).toContain("if (resolveProductExperienceTarget(command)) return;");
  });

  it("keeps one conversation instance mounted while visibility changes", () => {
    expect(composition).toContain("conversation={<MetrixTabScreen />}");
    expect(experienceHost).toContain("<WorkspacePresentationProvider value={!conversationVisible}>{conversation}</WorkspacePresentationProvider>");
    expect(experienceHost).toContain('h-[124px]');
    expect(experienceHost).toContain('duration-[380ms]');
    expect(experienceHost).not.toContain("inert={!conversationVisible ? true : undefined}");
    expect(experienceHost).not.toContain("router.push");
    expect(experienceHost).not.toContain("livingWorkspaceRuntime");
  });

  it("keeps conversation context in direct customer detail deep links", () => {
    expect(detailRoute).toContain("<CustomerDetailRouteExperience customerId={customerId} />");
    expect(detailRouteExperience).toContain("<WorkspacePresentationProvider value={true}><MetrixTabScreen /></WorkspacePresentationProvider>");
    expect(detailRouteExperience).toContain("<CustomerDetailScreen customerId={customerId} />");
    expect(detailRouteExperience).toContain('h-[124px]');
    expect(detailRouteExperience).toContain('duration-[380ms]');
  });

  it("preserves the direct customer create deep-link screen", () => {
    expect(createRoute).toContain("<CustomerCreateScreen />");
  });
});
