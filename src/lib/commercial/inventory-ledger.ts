// Single canonical authority for turning InventoryMovement evidence into a
// current balance — the inventory-domain analogue of commercial/receivable.ts.
// No I/O, no Prisma. Quantity arithmetic is done in exact BigInt
// milli-units (3 decimal places, matching Decimal(14,3)) so summing many
// movements never drifts the way repeated floating-point addition would —
// the same scaling technique quote-totals.ts/receivable.ts already use for
// money (cents), applied to quantity instead.

const QUANTITY_SCALE = 1000;

export type InventoryMovementLedgerRow = {
  quantity: unknown;
  direction: "IN" | "OUT";
};

/** Converts a Decimal(14,3)-compatible quantity into exact milli-unit BigInt. */
export function quantityToMilli(quantity: number): bigint {
  return BigInt(Math.round(quantity * QUANTITY_SCALE));
}

/** Inverse of quantityToMilli. */
export function milliToQuantity(milli: bigint): number {
  return Number(milli) / QUANTITY_SCALE;
}

/** True if quantity is finite, positive, and expressible with at most 3 decimal places. */
export function isValidPositiveQuantity(quantity: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return false;
  }

  const scaled = quantity * QUANTITY_SCALE;

  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** net = SUM(IN) - SUM(OUT), in exact milli-units. */
export function computeNetQuantityMilli(
  movements: readonly InventoryMovementLedgerRow[]
): bigint {
  return movements.reduce((net, movement) => {
    const milli = quantityToMilli(Number(movement.quantity));

    return movement.direction === "OUT" ? net - milli : net + milli;
  }, BigInt(0));
}
