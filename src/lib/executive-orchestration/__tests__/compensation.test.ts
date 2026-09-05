import { describe, expect, it } from "vitest";
import { deriveCompensationCalls } from "../compensation";
import type { ActionDefinition } from "@/lib/action-runtime/registry/action-registry.types";

function makeDefinition(overrides: Partial<ActionDefinition>): ActionDefinition {
  return {
    actionName: "test.action",
    actionClass: "DOMAIN",
    ownerModule: "test",
    inputSchema: {},
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: null,
    ...overrides,
  };
}

describe("deriveCompensationCalls", () => {
  it("returns null when there is no compensationRef (hard, unreachable-in-practice floor)", () => {
    const definition = makeDefinition({ actionName: "task.create", compensationRef: null });
    const calls = deriveCompensationCalls(
      { actionName: "task.create", resultEntityType: "task", resultEntityId: "t1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toBeNull();
  });

  it("returns null when the CREATE step never produced a resultEntityId", () => {
    const definition = makeDefinition({ actionName: "customer.create", compensationRef: "customer.archive" });
    const calls = deriveCompensationCalls(
      { actionName: "customer.create", resultEntityType: null, resultEntityId: null, compensationSnapshot: null },
      definition,
    );
    expect(calls).toBeNull();
  });

  it("derives a CREATE→archive call from resultEntityId, using the compensator's own id field", () => {
    const definition = makeDefinition({ actionName: "customer.create", compensationRef: "customer.archive" });
    const calls = deriveCompensationCalls(
      { actionName: "customer.create", resultEntityType: "customer", resultEntityId: "c1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toEqual([{ actionName: "customer.archive", input: { customerId: "c1" } }]);
  });

  it("attaches required extra fields the compensator needs beyond the id (order.cancel's reason)", () => {
    const definition = makeDefinition({ actionName: "order.create", compensationRef: "order.cancel" });
    const calls = deriveCompensationCalls(
      { actionName: "order.create", resultEntityType: "order", resultEntityId: "o1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toEqual([{ actionName: "order.cancel", input: { orderId: "o1", reason: expect.any(String) } }]);
  });

  it("attaches quote.set_lifecycle's required status field for quote.create's compensation", () => {
    const definition = makeDefinition({ actionName: "quote.create", compensationRef: "quote.set_lifecycle" });
    const calls = deriveCompensationCalls(
      { actionName: "quote.create", resultEntityType: "quote", resultEntityId: "q1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toEqual([{ actionName: "quote.set_lifecycle", input: { quoteId: "q1", status: "CANCELLED" } }]);
  });

  it("attaches organization_member.update's disabled:true for organization_member.create's compensation — reversing an invite disables the new membership", () => {
    const definition = makeDefinition({ actionName: "organization_member.create", compensationRef: "organization_member.update" });
    const calls = deriveCompensationCalls(
      { actionName: "organization_member.create", resultEntityType: "organization_member", resultEntityId: "member-1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toEqual([{ actionName: "organization_member.update", input: { memberId: "member-1", disabled: true } }]);
  });

  it("self-compensates an UPDATE action by replaying its own captured snapshot", () => {
    const definition = makeDefinition({ actionName: "customer.update", compensationRef: "customer.update" });
    const snapshot = { customerId: "c1", patch: { displayName: "Old Name" }, expectedVersion: "2" };
    const calls = deriveCompensationCalls(
      { actionName: "customer.update", resultEntityType: "customer", resultEntityId: "c1", compensationSnapshot: snapshot },
      definition,
    );
    expect(calls).toEqual([{ actionName: "customer.update", input: snapshot }]);
  });

  it("self-compensation is a no-op (empty array) when the forward call was NO_CHANGE (no snapshot)", () => {
    const definition = makeDefinition({ actionName: "customer.update", compensationRef: "customer.update" });
    const calls = deriveCompensationCalls(
      { actionName: "customer.update", resultEntityType: "customer", resultEntityId: "c1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toEqual([]);
  });

  it("builds a single stock.adjustment call to reverse stock.receive from its captured before-quantity", () => {
    const definition = makeDefinition({ actionName: "stock.receive", compensationRef: "stock.adjustment" });
    const snapshot = { productServiceId: "p1", warehouseId: "w1", quantityBefore: 10, lot: null, batch: null, serialNumber: null };
    const calls = deriveCompensationCalls(
      { actionName: "stock.receive", resultEntityType: "stock", resultEntityId: "s1", compensationSnapshot: snapshot },
      definition,
    );
    expect(calls).toEqual([{
      actionName: "stock.adjustment",
      input: { productServiceId: "p1", warehouseId: "w1", countedQuantity: 10, lot: null, batch: null, serialNumber: null, reason: expect.any(String) },
    }]);
  });

  it("builds two stock.adjustment calls (one per warehouse) to reverse stock.transfer", () => {
    const definition = makeDefinition({ actionName: "stock.transfer", compensationRef: "stock.adjustment" });
    const snapshot = {
      productServiceId: "p1", fromWarehouseId: "w1", toWarehouseId: "w2",
      fromQuantityBefore: 10, toQuantityBefore: 0, lot: null, batch: null, serialNumber: null,
    };
    const calls = deriveCompensationCalls(
      { actionName: "stock.transfer", resultEntityType: "stock", resultEntityId: "s1", compensationSnapshot: snapshot },
      definition,
    );
    expect(calls).toHaveLength(2);
    expect(calls![0]).toEqual({ actionName: "stock.adjustment", input: expect.objectContaining({ warehouseId: "w1", countedQuantity: 10 }) });
    expect(calls![1]).toEqual({ actionName: "stock.adjustment", input: expect.objectContaining({ warehouseId: "w2", countedQuantity: 0 }) });
  });

  it("returns an empty plan (not a failure) when a hybrid compensator has no snapshot to work from", () => {
    const definition = makeDefinition({ actionName: "stock.receive", compensationRef: "stock.adjustment" });
    const calls = deriveCompensationCalls(
      { actionName: "stock.receive", resultEntityType: "stock", resultEntityId: "s1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toEqual([]);
  });

  it("skips compensation for a CREATE step whose forward call was a NO_CHANGE dedup match", () => {
    // product.create matches by name against an existing record and returns
    // resultOutcome: "NO_CHANGE" — archiving that record on rollback would
    // wrongly touch data this orchestration never actually created. See
    // executeOneStep's NO_CHANGE → skipCompensation marker.
    const definition = makeDefinition({ actionName: "product.create", compensationRef: "product.archive" });
    const calls = deriveCompensationCalls(
      { actionName: "product.create", resultEntityType: "product", resultEntityId: "p1", compensationSnapshot: { skipCompensation: true } },
      definition,
    );
    expect(calls).toEqual([]);
  });

  it("returns null for an unrecognized compensationRef target (defensive floor)", () => {
    const definition = makeDefinition({ actionName: "mystery.create", compensationRef: "mystery.undo" });
    const calls = deriveCompensationCalls(
      { actionName: "mystery.create", resultEntityType: "mystery", resultEntityId: "m1", compensationSnapshot: null },
      definition,
    );
    expect(calls).toBeNull();
  });
});
