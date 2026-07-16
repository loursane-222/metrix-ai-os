import { describe, expect, it } from "vitest";

import { createInMemoryApprovalStore } from "../approval-store";
import type { ApprovalRequest } from "../policy.types";

function buildRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    approvalId: "appr_1",
    actionName: "customer.archive",
    normalizedInputHash: "hash_1",
    actorId: "actor_1",
    organizationId: "org_1",
    approvalTtlClass: "SHORT",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:05:00.000Z",
    status: "PENDING",
    ...overrides,
  };
}

describe("createInMemoryApprovalStore", () => {
  it("saves and finds a request", () => {
    const store = createInMemoryApprovalStore();
    store.save(buildRequest());

    expect(store.find("appr_1")).toEqual(buildRequest());
  });

  it("returns undefined for an unknown id", () => {
    expect(createInMemoryApprovalStore().find("missing")).toBeUndefined();
  });

  it("updates an existing request in place", () => {
    const store = createInMemoryApprovalStore();
    store.save(buildRequest());

    store.update(buildRequest({ status: "GRANTED" }));

    expect(store.find("appr_1")?.status).toBe("GRANTED");
  });

  it("lists requests scoped to a single actor and organization", () => {
    const store = createInMemoryApprovalStore();
    store.save(buildRequest({ approvalId: "a", actorId: "actor_1", organizationId: "org_1" }));
    store.save(buildRequest({ approvalId: "b", actorId: "actor_2", organizationId: "org_1" }));
    store.save(buildRequest({ approvalId: "c", actorId: "actor_1", organizationId: "org_2" }));

    const results = store.listByActorAndOrganization("actor_1", "org_1");

    expect(results.map((r) => r.approvalId)).toEqual(["a"]);
  });

  it("does not leak state between separate store instances", () => {
    const storeA = createInMemoryApprovalStore();
    const storeB = createInMemoryApprovalStore();

    storeA.save(buildRequest());

    expect(storeB.find("appr_1")).toBeUndefined();
  });
});
