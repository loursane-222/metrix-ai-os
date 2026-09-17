import { executeQuoteMarkWon } from "./quote-mark-won";
import { executeOrderCreateFromQuote } from "./order-create-from-quote";
import { executeInvoiceCreateFromOrder } from "./invoice-create-from-order";
import { executeCollectionRecord } from "./collection-record";
import { executeDocumentGenerate } from "./document-generate";

export type ApprovableActionInput = {
  actorUserId: string;
  organizationId: string;
  idempotencyKey: string;
} & Record<string, unknown>;

export type ApprovableActionExecutor = (
  input: ApprovableActionInput
) => Promise<{ verified: true } & Record<string, unknown>>;

function asExecutor<T>(
  fn: (input: T) => Promise<{ verified: true } & Record<string, unknown>>
): ApprovableActionExecutor {
  return input => fn(input as T);
}

/**
 * The closed set of canonical actions a durable ApprovalRequest may
 * authorize. Every entry reuses an existing verified action executor
 * unchanged — the approval runtime adds a human gate in front of it, it
 * never re-implements the action's own business logic, idempotency, or
 * verification/readback.
 */
export const APPROVABLE_ACTIONS = {
  "quote.mark_won": asExecutor(executeQuoteMarkWon),
  "order.create_from_quote": asExecutor(executeOrderCreateFromQuote),
  "invoice.create_from_order": asExecutor(executeInvoiceCreateFromOrder),
  "collection.record": asExecutor(executeCollectionRecord),
  "document.generate": asExecutor(executeDocumentGenerate)
} satisfies Record<string, ApprovableActionExecutor>;

export const APPROVABLE_ACTION_TYPES = Object.keys(APPROVABLE_ACTIONS) as [
  keyof typeof APPROVABLE_ACTIONS,
  ...(keyof typeof APPROVABLE_ACTIONS)[]
];

export function isApprovableActionType(actionType: string): boolean {
  return Object.prototype.hasOwnProperty.call(APPROVABLE_ACTIONS, actionType);
}
