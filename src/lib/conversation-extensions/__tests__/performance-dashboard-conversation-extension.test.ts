import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ dispatchConversationNavigation: vi.fn() }));
vi.mock("../conversation-navigation-runtime", () => ({ dispatchConversationNavigation: mocks.dispatchConversationNavigation }));

const { performanceDashboardConversationExtension } = await import("../performance-dashboard-conversation-extension");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { pathname: "/" } });
});

describe("performance-dashboard-conversation-extension", () => {
  it("does not handle an unrelated utterance", async () => {
    const result = await performanceDashboardConversationExtension.execute("bu haftaki özetim");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.dispatchConversationNavigation).not.toHaveBeenCalled();
  });

  it("navigates to /metrix/performance and reports EXECUTED for 'performans panosunu göster'", async () => {
    const result = await performanceDashboardConversationExtension.execute("performans panosunu göster");

    expect(mocks.dispatchConversationNavigation).toHaveBeenCalledWith(expect.objectContaining({ route: "/metrix/performance", expectedSurfaceAuthorityKey: "goals.performance.page" }));
    expect(result.status).toBe("HANDOFF");
    expect(result.handoff).toMatchObject({ outcomeCode: "PERFORMANCE_DASHBOARD_OPENED", resultStatus: "EXECUTED", navigationRequested: true, navigationStatus: "COMPLETED" });
    expect(validateConversationExtensionHandoff(result.handoff)).not.toBeNull();
  });

  it("also matches 'hedef gerçekleşme panelini göster'", async () => {
    const result = await performanceDashboardConversationExtension.execute("hedef gerçekleşme panelini göster");
    expect(result.status).toBe("HANDOFF");
    expect(mocks.dispatchConversationNavigation).toHaveBeenCalledTimes(1);
  });
});
