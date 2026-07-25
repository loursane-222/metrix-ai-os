import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomerCreateConversationCoordinator } from "../customer-create-conversation-coordinator";
import type { CustomerCreatePlan } from "../customer-create-conversation-plan";

function lifecyclePayloads(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls
    .filter((call: unknown[]) => typeof call[0] === "string" && String(call[0]).includes("[lifecycle]"))
    .map((call: unknown[]) => JSON.parse(String(call[1])) as Record<string, unknown>);
}

const enrichPlan: CustomerCreatePlan = {
  kind: "CREATE_PLAN",
  intent: "UPDATE_DRAFT",
  fields: { currency: "EUR" },
  explicitCommit: false,
  unsupportedFields: [],
  operation: "ENRICH",
  entityReference: "Atlas",
  semantic: {
    domain: "customers",
    stage: "PROVIDE_FIELDS",
    confidence: "HIGH",
    source: "DETERMINISTIC",
    fallbackUsed: true,
    activeWorkflow: false,
  },
};

describe("customer conversation lifecycle telemetry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("observes the existing ENRICH delivery and EXPIRED failure without exposing values", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const planner = vi.fn().mockResolvedValue(enrichPlan);
    const deliver = vi.fn().mockResolvedValue({ status: "EXPIRED", changedExecutiveTargetIds: [], message: "raw navigation message" });
    const coordinator = new CustomerCreateConversationCoordinator({
      planner,
      navigate: () => false,
      deliver,
    });

    const result = await coordinator.execute("Atlas artık euro ile çalışıyor.", "written", "turn-enrich-1");
    expect(result).toMatchObject({ handled: true, status: "FAILED" });
    expect(planner).toHaveBeenCalledWith("Atlas artık euro ile çalışıyor.", null, "turn-enrich-1");
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ correlationId: "turn-enrich-1" }), true);

    const events = lifecyclePayloads(telemetry);
    expect(events.find((event) => event.event === "planner_resolved")).toMatchObject({
      correlationId: "turn-enrich-1", operation: "ENRICH", semanticStage: "PROVIDE_FIELDS",
      hasEntityReference: true, fieldCount: 1, explicitCommit: false,
    });
    expect(events.find((event) => event.event === "delivery_requested")).toMatchObject({ navigationRequested: true, operation: "ENRICH" });
    expect(events.find((event) => event.event === "delivery_completed")).toMatchObject({ navigationStatus: "EXPIRED", failureCode: "NAVIGATION_EXPIRED" });
    expect(events.find((event) => event.event === "coordinator_completed")).toMatchObject({
      handled: true, resultStatus: "FAILED", canonicalBypass: true,
      navigationStatus: "EXPIRED", failureCode: "NAVIGATION_EXPIRED",
    });
    const serialized = JSON.stringify(telemetry.mock.calls);
    for (const sensitive of ["Atlas", "EUR", "euro ile çalışıyor", "raw navigation message"]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("releases NOT_CUSTOMER_CREATE to canonical METRIX without navigation", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deliver = vi.fn();
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: vi.fn().mockResolvedValue({ kind: "NOT_CUSTOMER_CREATE" }),
      navigate: () => false,
      deliver,
    });
    await expect(coordinator.execute("Genel müdür sorusu", "voice", "turn-canonical-1"))
      .resolves.toEqual({ handled: false, status: "NOT_HANDLED", message: null });
    const events = lifecyclePayloads(telemetry);
    expect(events.find((event) => event.event === "coordinator_completed")).toMatchObject({
      source: "voice", handled: false, canonicalBypass: false, navigationRequested: false,
    });
    expect(events.some((event) => event.event === "delivery_requested")).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("keeps CREATE acceptance semantics and reports CREATE without another authority", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: vi.fn().mockResolvedValue({ ...enrichPlan, operation: "CREATE", intent: "OPEN", entityReference: undefined }),
      navigate: () => false,
      deliver: vi.fn().mockResolvedValue({ status: "FAILED", changedExecutiveTargetIds: [] }),
    });
    const result = await coordinator.execute("Yeni müşteri", "written", "turn-create-1");
    expect(result).toMatchObject({ handled: true, status: "FAILED" });
    expect(lifecyclePayloads(telemetry).find((event) => event.event === "planner_resolved"))
      .toMatchObject({ operation: "CREATE", correlationId: "turn-create-1" });
  });

  it("uses one lifecycle schema for written and voice turns", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: vi.fn().mockResolvedValue({ kind: "NOT_CUSTOMER_CREATE" }),
      navigate: () => false,
    });
    await coordinator.execute("written input", "written", "turn-written");
    await coordinator.execute("voice input", "voice", "turn-voice");

    const completed = lifecyclePayloads(telemetry).filter((event) => event.event === "coordinator_completed");
    expect(completed).toHaveLength(2);
    expect(completed.map((event) => event.source)).toEqual(["written", "voice"]);
    expect(Object.keys(completed[0]!).sort()).toEqual(Object.keys(completed[1]!).sort());
  });
});
