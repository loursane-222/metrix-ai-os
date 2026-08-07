import { describe, expect, it } from "vitest";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { ExecutiveNavigationCommandRuntime } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import { projectBusinessNavigation, resolveBusinessNavigation } from "@/lib/executive-request-resolution";
import { createCustomerWorkspaceDirective, createOfferWorkspaceDirective, createTaskWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { livingWorkspaceRuntime as directRuntime } from "../runtime";

const understanding: ConversationUnderstanding = {
  conversationKind: "company_related", userMotivation: "bilgi_almak", companyRelevance: "high", actionExpectation: "explicit", confidence: "high",
  shouldAskClarification: false, shouldInvokeExecutiveBrain: true, suggestedHandling: "executive_reasoning",
  businessNavigation: { operation: "NAVIGATE", domain: "customer", target: "detail", entityReference: "Atlas İnşaat" },
  reasoning: { summary: "fixture", observations: [], uncertainty: [], whyThisHandling: "fixture" },
};

describe("canonical workspace delivery", () => {
  it("delivers a resolved customer detail through one directive and visible-ready completion boundary", async () => {
    const resolution = await resolveBusinessNavigation({
      understanding,
      listCustomers: async () => [{ id: "atlas-1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null }],
    });
    expect(resolution.status).toBe("RESOLVED");
    if (resolution.status !== "RESOLVED") return;

    const projected = projectBusinessNavigation(resolution.descriptor);
    const directive = createCustomerWorkspaceDirective({ route: projected.route, source: "written", correlationId: "delivery-1" });
    expect(directive).toMatchObject({ businessSurface: "customer-detail", entityId: "atlas-1", correlationId: "delivery-1" });
    expect(livingWorkspaceRuntime.publish(directive)).toBe(true);
    expect(livingWorkspaceRuntime.getSnapshot()).toBe(directive);

    const runtime = new ExecutiveNavigationCommandRuntime(Date.now, () => 1 as never, () => undefined);
    const pending = runtime.publish({ ...projected, correlationId: "delivery-1", commandId: "delivery-command-1", source: "written" });
    runtime.transition(pending.command.commandId, pending.command.generation, "WAITING_FOR_SURFACE");
    runtime.transition(pending.command.commandId, pending.command.generation, "CLAIMED");
    runtime.transition(pending.command.commandId, pending.command.generation, "APPLYING");
    runtime.markApplicationCompleted(pending.command.commandId, pending.command.generation, []);

    let settled = false;
    void pending.completion.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(runtime.completePresented("delivery-1", projected.expectedSurfaceAuthorityKey)).toBe(true);
    await expect(pending.completion).resolves.toEqual({ status: "COMPLETED", changedExecutiveTargetIds: [] });
  });

  it("projects customer create, task create, and offer edit through the existing planners", () => {
    expect(createCustomerWorkspaceDirective({ route: "/metrix/customers/new", source: "written", correlationId: "customer-create" }))
      .toMatchObject({ businessSurface: "customer-create", navigationRoute: "/metrix/customers/new" });
    expect(createTaskWorkspaceDirective({ route: "/metrix/tasks/new", source: "written", correlationId: "task-create" }))
      .toMatchObject({ businessSurface: "task-create", navigationRoute: "/metrix/tasks/new" });
    expect(createOfferWorkspaceDirective({ route: "/metrix/offers/quote-1/edit", source: "written", correlationId: "offer-edit" }))
      .toMatchObject({ businessSurface: "offer-edit", entityId: "quote-1" });
  });

  it("exports one publisher/subscriber runtime instance", () => {
    expect(livingWorkspaceRuntime).toBe(directRuntime);
  });
});
