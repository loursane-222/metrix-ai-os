import type { ActionDefinition } from "@/lib/action-runtime/registry/action-registry.types";

export type CompensationCall = Readonly<{ actionName: string; input: Record<string, unknown> }>;

export type CompensationStepContext = Readonly<{
  actionName: string;
  resultEntityType: string | null;
  resultEntityId: string | null;
  compensationSnapshot: Record<string, unknown> | null;
}>;

// CREATE→archive/cancel/void compensators are invoked by id alone — this
// says which input field on the COMPENSATOR carries that id. One entry per
// compensationRef target actually used in the manifests (see the fixed
// compensationRef values in each domain's manifest file).
const COMPENSATION_PRIMARY_ID_FIELD: Readonly<Record<string, string>> = {
  "customer.archive": "customerId",
  "customer.unarchive": "customerId",
  "order.cancel": "orderId",
  "production.archive": "productionOrderId",
  "supplier.archive": "supplierId",
  "product.archive": "productServiceId",
  "delivery.cancel": "deliveryId",
  "warehouse.archive": "warehouseId",
  "workCenter.archive": "workCenterId",
  "machine.archive": "machineId",
  "invoice.void": "invoiceId",
  "payment.void": "paymentId",
  "task.cancel": "taskId",
  "executive_action.cancel": "executiveActionId",
  "company.unit.archive": "companyUnitId",
  "company.field_definition.deprecate": "definitionId",
  "quote.set_lifecycle": "quoteId",
  // organization_member.create -> organization_member.update: reversing an
  // invite disables the newly-created membership (there is no separate
  // archive/delete action for a member; disabling is this domain's
  // equivalent "undo", already an established, real state transition —
  // see organization-member-update-handler.ts).
  "organization_member.update": "memberId",
};

// Compensators that need more than just the id field — a required field
// with no natural "before" value to derive, filled with an honest,
// system-attributed reason/status rather than left for the caller to guess.
const AUTO_COMPENSATION_REASON = "Orkestrasyon adımı başarısız oldu; bu kayıt otomatik olarak geri alındı.";
const COMPENSATION_EXTRA_FIELDS: Readonly<Record<string, () => Record<string, unknown>>> = {
  "order.cancel": () => ({ reason: AUTO_COMPENSATION_REASON }),
  "delivery.cancel": () => ({ reason: AUTO_COMPENSATION_REASON }),
  "quote.set_lifecycle": () => ({ status: "CANCELLED" }),
  "organization_member.update": () => ({ disabled: true }),
};

// Special-shaped compensators whose input can't be derived from just an id
// — stock.receive/stock.transfer compensate via one or more stock.adjustment
// calls carrying the pre-mutation quantities captured in compensationSnapshot
// (see stock-receive-handler.ts/stock-transfer-handler.ts).
type CompensationInputBuilder = (step: CompensationStepContext) => readonly CompensationCall[] | null;
const COMPENSATION_INPUT_BUILDERS: Readonly<Record<string, CompensationInputBuilder>> = {
  "stock.receive": (step) => {
    const snapshot = step.compensationSnapshot;
    if (!snapshot) return [];
    return [{
      actionName: "stock.adjustment",
      input: {
        productServiceId: snapshot.productServiceId,
        warehouseId: snapshot.warehouseId,
        countedQuantity: snapshot.quantityBefore,
        lot: snapshot.lot,
        batch: snapshot.batch,
        serialNumber: snapshot.serialNumber,
        reason: AUTO_COMPENSATION_REASON,
      },
    }];
  },
  "stock.transfer": (step) => {
    const snapshot = step.compensationSnapshot;
    if (!snapshot) return [];
    return [
      {
        actionName: "stock.adjustment",
        input: {
          productServiceId: snapshot.productServiceId,
          warehouseId: snapshot.fromWarehouseId,
          countedQuantity: snapshot.fromQuantityBefore,
          lot: snapshot.lot,
          batch: snapshot.batch,
          serialNumber: snapshot.serialNumber,
          reason: AUTO_COMPENSATION_REASON,
        },
      },
      {
        actionName: "stock.adjustment",
        input: {
          productServiceId: snapshot.productServiceId,
          warehouseId: snapshot.toWarehouseId,
          countedQuantity: snapshot.toQuantityBefore,
          lot: snapshot.lot,
          batch: snapshot.batch,
          serialNumber: snapshot.serialNumber,
          reason: AUTO_COMPENSATION_REASON,
        },
      },
    ];
  },
};

// Derives the call(s) needed to reverse one COMPLETED step. Returns:
// - null: no known way to compensate this step (compensationRef is null, or
//   points at an unrecognized target) — a hard, loudly-surfaced
//   COMPENSATION_FAILED. Should be unreachable once every chainable action
//   carries a real compensator; this is a defensive floor, not an expected
//   path.
// - []: nothing to do (e.g. a self-compensating UPDATE whose forward call
//   was NO_CHANGE, or a special-shaped compensator with no snapshot) —
//   auto-compensated.
// - non-empty array: the ordered call(s) to execute (usually one; two for
//   stock.transfer).
export function deriveCompensationCalls(
  step: CompensationStepContext,
  definition: ActionDefinition,
): readonly CompensationCall[] | null {
  const ref = definition.compensationRef;
  if (ref === null) return null;

  // A NO_CHANGE forward outcome (e.g. product.create's dedup-by-name match,
  // or an UPDATE whose patch was a no-op) means this step found rather than
  // mutated a record — see executive-orchestration.service.ts's
  // executeOneStep, which stamps this marker for any NO_CHANGE result
  // regardless of action class. Nothing to reverse; compensating it would
  // wrongly archive/revert a record this orchestration never touched.
  if (step.compensationSnapshot?.skipCompensation === true) return [];

  // Self-compensation: UPDATE-class actions compensate by replaying their
  // own action with a captured "before" input (see execution.types.ts's
  // HandlerResult.compensationSnapshot contract).
  if (ref === definition.actionName) {
    if (!step.compensationSnapshot) return [];
    return [{ actionName: ref, input: step.compensationSnapshot }];
  }

  const builder = COMPENSATION_INPUT_BUILDERS[definition.actionName];
  if (builder) return builder(step);

  // Default: CREATE→archive/cancel/void, addressed by the created entity's
  // own id — nothing to compensate if the forward step never produced one.
  if (!step.resultEntityId) return null;
  const idField = COMPENSATION_PRIMARY_ID_FIELD[ref];
  if (!idField) return null;
  return [{ actionName: ref, input: { [idField]: step.resultEntityId, ...(COMPENSATION_EXTRA_FIELDS[ref]?.() ?? {}) } }];
}
