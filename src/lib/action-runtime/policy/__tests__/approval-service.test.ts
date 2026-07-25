import { describe, expect, it } from "vitest";

import { createApprovalService } from "../approval-service";
import { createInMemoryApprovalStore } from "../approval-store";
import { DEFAULT_POLICY_CONFIG } from "../policy-config";
import { ApprovalRequestNotFoundError, InvalidApprovalStateError } from "../policy.errors";
import type { CreateApprovalRequestInput, ExecutionCandidate } from "../policy.types";

function createFakeClock(startMs: number) {
  let currentMs = startMs;
  return {
    now: () => new Date(currentMs),
    advance: (ms: number) => {
      currentMs += ms;
    },
  };
}

function buildInput(overrides: Partial<CreateApprovalRequestInput> = {}): CreateApprovalRequestInput {
  return {
    actionName: "customer.archive",
    targetEntityRef: { entityType: "customer", entityId: "cust_1" },
    normalizedInputHash: "hash_1",
    actorId: "actor_1",
    organizationId: "org_1",
    approvalTtlClass: "SHORT",
    ...overrides,
  };
}

function buildCandidate(overrides: Partial<ExecutionCandidate> = {}): ExecutionCandidate {
  return {
    actionName: "customer.archive",
    actorId: "actor_1",
    organizationId: "org_1",
    targetEntityRef: { entityType: "customer", entityId: "cust_1" },
    normalizedInputHash: "hash_1",
    ...overrides,
  };
}

describe("ApprovalService — createApprovalRequest", () => {
  it("produces a request with the correct TTL for its approvalTtlClass", async () => {
    const clock = createFakeClock(1_000_000);
    const service = createApprovalService({ clock: clock.now });

    const request = await service.createApprovalRequest(buildInput({ approvalTtlClass: "SHORT" }));

    const expectedExpiry = 1_000_000 + DEFAULT_POLICY_CONFIG.approvalTtlMsByClass.SHORT;
    expect(request.createdAt).toBe(new Date(1_000_000).toISOString());
    expect(request.expiresAt).toBe(new Date(expectedExpiry).toISOString());
    expect(request.status).toBe("PENDING");
  });

  it("uses distinct TTLs for each approvalTtlClass", async () => {
    const clock = createFakeClock(0);
    const service = createApprovalService({ clock: clock.now });

    const short = await service.createApprovalRequest(buildInput({ approvalId: "a", approvalTtlClass: "SHORT" }));
    const standard = await service.createApprovalRequest(buildInput({ approvalId: "b", approvalTtlClass: "STANDARD" }));
    const extended = await service.createApprovalRequest(buildInput({ approvalId: "c", approvalTtlClass: "EXTENDED" }));

    expect(new Date(short.expiresAt).getTime()).toBeLessThan(new Date(standard.expiresAt).getTime());
    expect(new Date(standard.expiresAt).getTime()).toBeLessThan(new Date(extended.expiresAt).getTime());
  });
});

describe("ApprovalService — expiry", () => {
  it("rejects granting a request whose TTL has already elapsed", async () => {
    const clock = createFakeClock(0);
    const service = createApprovalService({ clock: clock.now });
    const request = await service.createApprovalRequest(buildInput({ approvalTtlClass: "SHORT" }));

    clock.advance(DEFAULT_POLICY_CONFIG.approvalTtlMsByClass.SHORT + 1);

    await expect(service.grantApproval(request.approvalId, "manager_1")).rejects.toThrow(InvalidApprovalStateError);
  });

  it("invalidates a grant once its expiry has passed", async () => {
    const clock = createFakeClock(0);
    const service = createApprovalService({ clock: clock.now });
    const request = await service.createApprovalRequest(buildInput({ approvalTtlClass: "SHORT" }));
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    clock.advance(DEFAULT_POLICY_CONFIG.approvalTtlMsByClass.SHORT + 1);

    const result = await service.validateApprovalGrant(grant, buildCandidate());

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("APPROVAL_EXPIRED");
  });
});

describe("ApprovalService — grant/validate mismatches", () => {
  it("rejects a grant when the input hash has changed", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    const result = await service.validateApprovalGrant(grant, buildCandidate({ normalizedInputHash: "hash_2" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("INPUT_HASH_MISMATCH");
  });

  it("rejects a grant used by a different actor", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    const result = await service.validateApprovalGrant(grant, buildCandidate({ actorId: "actor_OTHER" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ACTOR_MISMATCH");
  });

  it("rejects a grant used by a different organization", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    const result = await service.validateApprovalGrant(grant, buildCandidate({ organizationId: "org_OTHER" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ORGANIZATION_MISMATCH");
  });

  it("rejects a grant used for a different action", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    const result = await service.validateApprovalGrant(grant, buildCandidate({ actionName: "customer.update" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ACTION_MISMATCH");
  });

  it("rejects a grant used for a different target entity", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    const result = await service.validateApprovalGrant(
      grant,
      buildCandidate({ targetEntityRef: { entityType: "customer", entityId: "cust_OTHER" } }),
    );

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("TARGET_MISMATCH");
  });

  it("accepts a grant that matches every bound dimension", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    const result = await service.validateApprovalGrant(grant, buildCandidate());

    expect(result.valid).toBe(true);
    expect(result.reasonCode).toBe("APPROVAL_VALID");
  });
});

describe("ApprovalService — single use / consume / revoke", () => {
  it("cannot be validated as GRANTED again after being consumed", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    await service.consumeApproval(request.approvalId);

    const result = await service.validateApprovalGrant(grant, buildCandidate());
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("APPROVAL_ALREADY_CONSUMED");
  });

  it("cannot be consumed twice", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    await service.grantApproval(request.approvalId, "manager_1");
    await service.consumeApproval(request.approvalId);

    await expect(service.consumeApproval(request.approvalId)).rejects.toThrow(InvalidApprovalStateError);
  });

  it("is invalid after being revoked", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    await service.revokeApproval(request.approvalId);

    const result = await service.validateApprovalGrant(grant, buildCandidate());
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("APPROVAL_REVOKED");
  });
});

describe("ApprovalService — pending approvals isolation", () => {
  it("scopes listPendingApprovals to a single actor and organization", async () => {
    const service = createApprovalService();
    await service.createApprovalRequest(buildInput({ approvalId: "a", actorId: "actor_1", organizationId: "org_1" }));
    await service.createApprovalRequest(buildInput({ approvalId: "b", actorId: "actor_2", organizationId: "org_1" }));
    await service.createApprovalRequest(buildInput({ approvalId: "c", actorId: "actor_1", organizationId: "org_2" }));

    const pending = await service.listPendingApprovals("actor_1", "org_1");

    expect(pending.map((r) => r.approvalId)).toEqual(["a"]);
  });

  it("excludes granted requests from the pending list", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    await service.grantApproval(request.approvalId, "manager_1");

    expect(await service.listPendingApprovals("actor_1", "org_1")).toEqual([]);
  });
});

describe("ApprovalService — immutability", () => {
  it("freezes the returned ApprovalRequest", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());

    expect(Object.isFrozen(request)).toBe(true);
  });

  it("freezes the returned ApprovalGrant", async () => {
    const service = createApprovalService();
    const request = await service.createApprovalRequest(buildInput());
    const grant = await service.grantApproval(request.approvalId, "manager_1");

    expect(Object.isFrozen(grant)).toBe(true);
  });
});

describe("ApprovalService — lookups", () => {
  it("throws ApprovalRequestNotFoundError for an unknown approvalId", async () => {
    const service = createApprovalService();

    await expect(service.getApprovalRequest("missing")).rejects.toThrow(ApprovalRequestNotFoundError);
  });

  it("does not leak approval state across independently constructed services (no global mutable test leakage)", async () => {
    const serviceA = createApprovalService({ store: createInMemoryApprovalStore() });
    const serviceB = createApprovalService({ store: createInMemoryApprovalStore() });

    const request = await serviceA.createApprovalRequest(buildInput());

    await expect(serviceB.getApprovalRequest(request.approvalId)).rejects.toThrow(ApprovalRequestNotFoundError);
  });
});
