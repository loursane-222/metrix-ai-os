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
    riskLevel: "HIGH",
    correlationId: "corr_1",
    idempotencyKey: "idem_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:05:00.000Z",
    status: "PENDING",
    ...overrides,
  };
}

describe("createInMemoryApprovalStore", () => {
  it("saves and finds a request", async () => {
    const store = createInMemoryApprovalStore();
    await store.save(buildRequest());

    expect(await store.find("appr_1")).toEqual(buildRequest());
  });

  it("returns undefined for an unknown id", async () => {
    expect(await createInMemoryApprovalStore().find("missing")).toBeUndefined();
  });

  it("updates an existing request in place", async () => {
    const store = createInMemoryApprovalStore();
    await store.save(buildRequest());

    await store.update(buildRequest({ status: "GRANTED" }));

    expect((await store.find("appr_1"))?.status).toBe("GRANTED");
  });

  it("lists requests scoped to a single actor and organization", async () => {
    const store = createInMemoryApprovalStore();
    await store.save(buildRequest({ approvalId: "a", actorId: "actor_1", organizationId: "org_1" }));
    await store.save(buildRequest({ approvalId: "b", actorId: "actor_2", organizationId: "org_1" }));
    await store.save(buildRequest({ approvalId: "c", actorId: "actor_1", organizationId: "org_2" }));

    const results = await store.listByActorAndOrganization("actor_1", "org_1");

    expect(results.map((r) => r.approvalId)).toEqual(["a"]);
  });

  it("does not leak state between separate store instances", async () => {
    const storeA = createInMemoryApprovalStore();
    const storeB = createInMemoryApprovalStore();

    await storeA.save(buildRequest());

    expect(await storeB.find("appr_1")).toBeUndefined();
  });
});
