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
  it("produces a request with the correct TTL for its approvalTtlClass", () => {
    const clock = createFakeClock(1_000_000);
    const service = createApprovalService({ clock: clock.now });

    const request = service.createApprovalRequest(buildInput({ approvalTtlClass: "SHORT" }));

    const expectedExpiry = 1_000_000 + DEFAULT_POLICY_CONFIG.approvalTtlMsByClass.SHORT;
    expect(request.createdAt).toBe(new Date(1_000_000).toISOString());
    expect(request.expiresAt).toBe(new Date(expectedExpiry).toISOString());
    expect(request.status).toBe("PENDING");
  });

  it("uses distinct TTLs for each approvalTtlClass", () => {
    const clock = createFakeClock(0);
    const service = createApprovalService({ clock: clock.now });

    const short = service.createApprovalRequest(buildInput({ approvalId: "a", approvalTtlClass: "SHORT" }));
    const standard = service.createApprovalRequest(buildInput({ approvalId: "b", approvalTtlClass: "STANDARD" }));
    const extended = service.createApprovalRequest(buildInput({ approvalId: "c", approvalTtlClass: "EXTENDED" }));

    expect(new Date(short.expiresAt).getTime()).toBeLessThan(new Date(standard.expiresAt).getTime());
    expect(new Date(standard.expiresAt).getTime()).toBeLessThan(new Date(extended.expiresAt).getTime());
  });
});

describe("ApprovalService — expiry", () => {
  it("rejects granting a request whose TTL has already elapsed", () => {
    const clock = createFakeClock(0);
    const service = createApprovalService({ clock: clock.now });
    const request = service.createApprovalRequest(buildInput({ approvalTtlClass: "SHORT" }));

    clock.advance(DEFAULT_POLICY_CONFIG.approvalTtlMsByClass.SHORT + 1);

    expect(() => service.grantApproval(request.approvalId, "manager_1")).toThrow(InvalidApprovalStateError);
  });

  it("invalidates a grant once its expiry has passed", () => {
    const clock = createFakeClock(0);
    const service = createApprovalService({ clock: clock.now });
    const request = service.createApprovalRequest(buildInput({ approvalTtlClass: "SHORT" }));
    const grant = service.grantApproval(request.approvalId, "manager_1");

    clock.advance(DEFAULT_POLICY_CONFIG.approvalTtlMsByClass.SHORT + 1);

    const result = service.validateApprovalGrant(grant, buildCandidate());

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("APPROVAL_EXPIRED");
  });
});

describe("ApprovalService — grant/validate mismatches", () => {
  it("rejects a grant when the input hash has changed", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    const result = service.validateApprovalGrant(grant, buildCandidate({ normalizedInputHash: "hash_2" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("INPUT_HASH_MISMATCH");
  });

  it("rejects a grant used by a different actor", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    const result = service.validateApprovalGrant(grant, buildCandidate({ actorId: "actor_OTHER" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ACTOR_MISMATCH");
  });

  it("rejects a grant used by a different organization", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    const result = service.validateApprovalGrant(grant, buildCandidate({ organizationId: "org_OTHER" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ORGANIZATION_MISMATCH");
  });

  it("rejects a grant used for a different action", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    const result = service.validateApprovalGrant(grant, buildCandidate({ actionName: "customer.update" }));

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ACTION_MISMATCH");
  });

  it("rejects a grant used for a different target entity", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    const result = service.validateApprovalGrant(
      grant,
      buildCandidate({ targetEntityRef: { entityType: "customer", entityId: "cust_OTHER" } }),
    );

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("TARGET_MISMATCH");
  });

  it("accepts a grant that matches every bound dimension", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    const result = service.validateApprovalGrant(grant, buildCandidate());

    expect(result.valid).toBe(true);
    expect(result.reasonCode).toBe("APPROVAL_VALID");
  });
});

describe("ApprovalService — single use / consume / revoke", () => {
  it("cannot be validated as GRANTED again after being consumed", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    service.consumeApproval(request.approvalId);

    const result = service.validateApprovalGrant(grant, buildCandidate());
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("APPROVAL_ALREADY_CONSUMED");
  });

  it("cannot be consumed twice", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    service.grantApproval(request.approvalId, "manager_1");
    service.consumeApproval(request.approvalId);

    expect(() => service.consumeApproval(request.approvalId)).toThrow(InvalidApprovalStateError);
  });

  it("is invalid after being revoked", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    service.revokeApproval(request.approvalId);

    const result = service.validateApprovalGrant(grant, buildCandidate());
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("APPROVAL_REVOKED");
  });
});

describe("ApprovalService — pending approvals isolation", () => {
  it("scopes listPendingApprovals to a single actor and organization", () => {
    const service = createApprovalService();
    service.createApprovalRequest(buildInput({ approvalId: "a", actorId: "actor_1", organizationId: "org_1" }));
    service.createApprovalRequest(buildInput({ approvalId: "b", actorId: "actor_2", organizationId: "org_1" }));
    service.createApprovalRequest(buildInput({ approvalId: "c", actorId: "actor_1", organizationId: "org_2" }));

    const pending = service.listPendingApprovals("actor_1", "org_1");

    expect(pending.map((r) => r.approvalId)).toEqual(["a"]);
  });

  it("excludes granted requests from the pending list", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    service.grantApproval(request.approvalId, "manager_1");

    expect(service.listPendingApprovals("actor_1", "org_1")).toEqual([]);
  });
});

describe("ApprovalService — immutability", () => {
  it("freezes the returned ApprovalRequest", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());

    expect(Object.isFrozen(request)).toBe(true);
  });

  it("freezes the returned ApprovalGrant", () => {
    const service = createApprovalService();
    const request = service.createApprovalRequest(buildInput());
    const grant = service.grantApproval(request.approvalId, "manager_1");

    expect(Object.isFrozen(grant)).toBe(true);
  });
});

describe("ApprovalService — lookups", () => {
  it("throws ApprovalRequestNotFoundError for an unknown approvalId", () => {
    const service = createApprovalService();

    expect(() => service.getApprovalRequest("missing")).toThrow(ApprovalRequestNotFoundError);
  });

  it("does not leak approval state across independently constructed services (no global mutable test leakage)", () => {
    const serviceA = createApprovalService({ store: createInMemoryApprovalStore() });
    const serviceB = createApprovalService({ store: createInMemoryApprovalStore() });

    const request = serviceA.createApprovalRequest(buildInput());

    expect(() => serviceB.getApprovalRequest(request.approvalId)).toThrow(ApprovalRequestNotFoundError);
  });
});
