import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
describe("Executive App Shell contracts", () => {
  const layout = read("src/app/metrix/layout.tsx");
  const rootEntry = read("src/app/metrix-onboarding-app.tsx");
  const metrixPage = read("src/app/metrix/page.tsx");
  const shell = read("src/components/living-workspace/ExecutiveAppShell.tsx");
  const host = read("src/components/living-workspace/LivingWorkspaceHost.tsx");
  const resolver = read("src/components/living-workspace/BusinessSurfaceResolver.tsx");
  const adapters = read("src/lib/living-workspace/domain-adapters.ts");
  const tabs = read("src/components/metrix-tab/MetrixTabScreen.tsx");
  const chat = read("src/components/metrix-tab/MetrixChatTab.tsx");
  const presentation = read("src/components/living-workspace/WorkspacePresentationContext.tsx");
  const headerActions = read("src/components/living-workspace/ExecutiveHeaderActionsContext.tsx");
  const customerExtension = read("src/lib/conversation-extensions/customer-management-conversation-extension.ts");
  const customerAttachment = read("src/lib/customers/customer-attachment-conversation-coordinator.ts");
  it("has one layout-lifetime shell and header authority, with no bottom dock", () => {
    expect(layout.match(/<ExecutiveAppShell>/g)).toHaveLength(1);
    expect(rootEntry.match(/<ExecutiveAppShell>/g)).toHaveLength(1);
    expect(shell.match(/<header/g)).toHaveLength(1);
    expect(shell.match(/aria-label="Sohbet Geçmişi"/g)).toHaveLength(1);
    expect(shell.match(/aria-label="Ayarlar"/g)).toHaveLength(1);
    expect(shell.match(/data-global-header="conversation"/g)).toHaveLength(1);
    expect(shell.match(/data-global-wordmark="METRIX"/g)).toHaveLength(1);
    expect(shell).toContain("fixed inset-x-0 top-0 z-40");
    expect(shell).toContain("pt-[calc(58px+env(safe-area-inset-top))]");
    expect(shell).not.toMatch(/ExecutiveDock|aria-label="Executive Dock"|Şirketim|Günlük Ritim|İş Planı/);
    expect(chat).not.toContain("<header");
    expect(chat).not.toContain("onClick={openHistory}");
    expect(chat).not.toContain("onClick={startNewConversation}");
    expect(chat).not.toContain("justify-center gap-2 border-b");
    expect(tabs).not.toMatch(/BottomNav|ExecutiveDock|PlaceholderTab/);
  });
  it("mounts Living Workspace at canonical root and leaves exact metrix entry as redirect-only", () => {
    expect(shell).toContain('if (pathname !== "/") redirect("/")');
    expect(shell).not.toContain('pathname === "/metrix"');
    expect(shell).not.toContain('{children}</div>');
    expect(shell).toContain('href="/"');
    expect(metrixPage).toContain('redirect("/")');
    expect(metrixPage).not.toContain("MetrixTabScreen");
  });
  it("shares one atmosphere provider between conversation and workspace", () => {
    const tabScreen = read("src/components/metrix-tab/MetrixTabScreen.tsx");
    const hostProviders = host.match(/<AtmosphereAssessmentProvider>/g) ?? [];
    expect(hostProviders).toHaveLength(1);
    expect(tabScreen).not.toContain("AtmosphereAssessmentProvider");
    expect(host).toContain("<LivingWorkspaceSurface");
    expect(chat).toContain("setAssessment(nextAssessment)");
  });
  it("delegates shell controls to the one conversation-owned history and settings surfaces", () => {
    expect(shell).toContain("headerActionsRef.current?.openHistory()");
    expect(shell).toContain("headerActionsRef.current?.toggleSettings()");
    expect(chat).toContain("useExecutiveHeaderActions({");
    expect(chat.match(/<HistorySheet/g)).toHaveLength(1);
    expect(chat.match(/<SettingsMenu/g)).toHaveLength(1);
    expect(chat).toContain("onNew={() => {");
    expect(chat).toContain("startNewConversation();");
    expect(chat).toContain("+ Yeni Sohbet");
    expect(chat.match(/<ExecutiveFacePresence\b/g)).toHaveLength(1);
    expect(chat).not.toContain('>\n        Metrix\n      </p>');
    expect(headerActions).toContain("actionsRef.current.openHistory()");
    expect(headerActions).toContain("actionsRef.current.toggleSettings()");
  });
  it("presents the history drawer as a dark left-side panel, not a light bottom sheet", () => {
    const historySheetStart = chat.indexOf("function HistorySheet(");
    const historySheetEnd = chat.indexOf("\nfunction ", historySheetStart + 1);
    const historySheet = chat.slice(historySheetStart, historySheetEnd);
    expect(historySheetStart).toBeGreaterThan(-1);
    expect(historySheet).toContain("activeConversationId");
    expect(historySheet).not.toContain("bg-[#faf8f3]");
    expect(historySheet).not.toContain("rounded-t-[24px]");
    expect(historySheet).not.toContain("flex-col justify-end");
    expect(historySheet).toContain("w-[min(90vw,380px)]");
    expect(historySheet).toContain("bg-[#0b131b]/97");
  });
  it("locks body-height behavior with no bottom-dock safe-area reservation", () => {
    expect(shell).toContain("h-[100dvh]");
    expect(shell).toContain("overflow-hidden");
    expect(shell).not.toContain("env(safe-area-inset-bottom)");
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
  it("mounts the real Customer draft surfaces inside Living Workspace", () => {
    expect(host).not.toContain("CustomerCreateScreen");
    expect(host).not.toContain("CustomerEditScreen");
    expect(host).not.toContain('businessSurface === "customer-');
    expect(host).toContain("resolveBusinessSurface(directive, { onReady, onFailure })");
    expect(host).toContain("businessSurface ?? <GenericDirectiveSurface");
    expect(resolver).toContain('<CustomerCreateScreen presentation="living"/>');
    expect(resolver).toContain('<CustomerEditScreen customerId={directive.entityId} onSurfaceFailure={readiness?.onFailure} onSurfaceReady={readiness?.onReady} presentation="living"/>');
    expect(resolver).toContain('"customer-list"');
    expect(host).toContain("eski jenerik kayıt görünümü kullanılmadı");
    expect(read("src/components/input-authority/ExecutiveNavigationCommandHost.tsx")).toContain("createCustomerWorkspaceDirective");
  });
  it("keeps customer detail/create on the sole Living Workspace owner", () => {
    expect(rootEntry).toContain("<ExecutiveAppShell>");
    expect(rootEntry).toContain("<MetrixTabScreen />");
    expect(rootEntry).not.toContain("ProductExperience");
    expect(layout).not.toContain("ProductExperience");
    expect(read("src/components/input-authority/ExecutiveNavigationCommandHost.tsx")).not.toContain("resolveProductExperienceTarget");
    expect(read("src/components/input-authority/ExecutiveNavigationCommandHost.tsx")).not.toContain("claimProductExperienceCommand");
    expect(read("src/components/living-workspace/BusinessSurfaceResolver.tsx")).toContain('directive.businessSurface === "customer-create"');
    expect(read("src/components/living-workspace/BusinessSurfaceResolver.tsx")).toContain('directive.businessSurface === "customer-detail"');
  });
  it("keeps inline controls on the Living Workspace runtime", () => {
    const customers = read("src/components/customers/CustomersListScreen.tsx");
    const taskCreate = read("src/components/living-workspace/TaskCreateScreen.tsx");
    const presence = read("src/components/executive-presence/ExecutivePresenceRuntime.tsx");
    expect(customers).toContain("createCustomerWorkspaceDirective");
    expect(customers).toContain("livingWorkspaceRuntime.publish");
    expect(taskCreate).toContain("createTaskWorkspaceDirective");
    expect(taskCreate).toContain("livingWorkspaceRuntime.publish");
    expect(customers).not.toContain('router.push("/metrix');
    expect(taskCreate).not.toContain('router.push("/metrix');
    expect(presence).not.toContain('router.push("/metrix');
    expect(customerExtension).not.toContain("window.location.assign");
    expect(customerAttachment).not.toContain("window.location.assign");
  });
  it("opens the workspace in flow below the global header, not as an overlay or right panel", () => {
    expect(host).not.toContain("workspaceLayoutClass");
    expect(host).not.toContain("lg:grid-cols-");
    expect(host).not.toContain("border-r");
    expect(host).toContain("duration-[380ms]");
    expect(host).toContain("flex h-full min-h-0 flex-col overflow-hidden");
    expect(host).toContain('surfaceVisible ? "min-h-0 flex-1');
    expect(host).toContain('data-workspace-frame="in-flow-top"');
    expect(host).toContain('expanded ? "h-[210px] shrink-0 sm:h-[190px]" : "flex-1"');
    expect(host).toContain("flex h-full min-h-0 w-full flex-col overflow-hidden");
    expect(host).not.toContain("max-h-[55vh]");
    expect(host).not.toContain("absolute inset-x-0 bottom-[77px] top-0");
    expect(host).not.toContain("md:opacity-55");
    expect(host).not.toContain("md:blur-[1px]");
    expect(host).not.toContain("backdrop-blur-[2px]");
    expect(host).not.toContain("bg-[#14120F]/35");
    expect(host).toContain("motion-reduce:transition-none");
    expect(host).toContain('aria-label="Sohbete dön"');
    expect(host).toContain('directive?.businessSurface === "offer-edit"');
    expect(host).toContain('offerTemplate && expanded ? "h-[116px] shrink-0"');
    expect(host).toContain("{!offerTemplate ?");
  });
  it("keeps the same conversation mounted as the workspace context strip", () => {
    expect(host).toContain("WorkspacePresentationProvider value={expanded}");
    expect(chat).toContain("useWorkspacePresentation()");
    expect(chat).toContain('data-conversation-context="workspace"');
    expect(chat).toContain("latestUser");
    expect(chat).toContain("latestMetrix");
    expect(presentation).toContain("createContext(false)");
  });
  it("never presents an empty or loading workspace frame", () => {
    expect(host).not.toContain("Çalışma yüzeyi hazır");
    expect(host).not.toContain("Canonical veriler hazırlanıyor");
    expect(host).toContain("surfaceReady === directiveId");
    expect(host).toContain("onReady();");
    expect(host).toContain("workspaceIdentity(directive)");
  });
  it("removes Product MetrixWorkspace demo authority", () => {
    expect(read("src/app/metrix/products/page.tsx")).not.toContain("MetrixWorkspace");
  });
  it("does not mount the legacy demo workspace on production module routes", () => {
    const routes = ["company-dna", "daily-rhythm", "opinion", "sales", "templates", "work-plan"];
    for (const route of routes) {
      const page = read(`src/app/metrix/${route}/page.tsx`);
      expect(page).not.toContain("MetrixWorkspace");
      expect(page).toContain("UnavailableBusinessSurface");
    }
    expect(read("src/app/metrix/accounting/page.tsx")).toContain("AccountingCanonicalScreen");
    expect(read("src/app/metrix/finance/page.tsx")).toContain("FinanceCanonicalScreen");
    expect(read("src/app/metrix/reports/page.tsx")).toContain("ReportCanonicalScreen");
    expect(read("src/app/metrix/documents/page.tsx")).toContain("DocumentCanonicalScreen");
    expect(read("src/app/metrix/kpis/page.tsx")).toContain("KpiCanonicalScreen");
    expect(read("src/app/metrix/goals/page.tsx")).toContain("GoalCanonicalScreen");
    expect(read("src/app/metrix/team/page.tsx")).toContain("TeamCanonicalScreen");
    expect(read("src/app/metrix/suppliers/page.tsx")).toContain("SupplierCanonicalScreen");
  });
  it("does not derive workspace navigation from user utterance keywords", () => {
    const planner = read("src/lib/living-workspace/planner.ts");
    expect(planner).not.toContain("utterance");
    expect(planner).not.toContain("RegExp");
    expect(read("src/components/metrix-tab/MetrixChatTab.tsx")).not.toContain("publishWorkspaceIntent");
  });
});
