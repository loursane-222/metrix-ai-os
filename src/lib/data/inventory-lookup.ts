import { db } from "../db";

import { requireOrganizationAccess } from "../auth/organization-access";

import type {
  InventoryDirection,
  InventoryMovementKind
} from "../../generated/prisma/enums";

const MAX_MOVEMENTS = 20;

export type InventoryBalanceReality = {
  productServiceId: string;
  locationId: string;
  quantity: number;
};

export type InventoryMovementReality = {
  id: string;
  productServiceId: string;
  locationId: string;
  kind: InventoryMovementKind;
  direction: InventoryDirection;
  quantity: number;
  occurredAt: string;
  sourceType: string;
  sourceId: string;
};

export type InventoryLookupResult = {
  balances: InventoryBalanceReality[];
  recentMovements: InventoryMovementReality[];
};

/**
 * Pure read: balances come from the InventoryBalance cache (kept in exact
 * sync with the movement evidence by every mutating action's verified
 * readback); recent movements come straight from the append-only
 * InventoryMovement evidence, in bounded deterministic order.
 */
export async function lookupInventory(
  input: {
    actorUserId: string;
    organizationId: string;
    productServiceId?: string;
    locationId?: string;
  }
): Promise<InventoryLookupResult> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();
  const productServiceId = input.productServiceId?.trim();
  const locationId = input.locationId?.trim();

  await requireOrganizationAccess({ userId: actorUserId, organizationId });

  // No selector -> organization-wide bounded collection (same shape as
  // the scoped case below, just without the productServiceId/locationId
  // narrowing) — matches the "no selector -> bounded collection" standard
  // already used by quote/order/invoice/location lookups.
  const scope = {
    organizationId,
    ...(productServiceId ? { productServiceId } : {}),
    ...(locationId ? { locationId } : {})
  };

  const [balances, recentMovements] = await Promise.all([
    db.inventoryBalance.findMany({
      where: scope,
      select: { productServiceId: true, locationId: true, quantity: true },
      orderBy: [{ locationId: "asc" }, { productServiceId: "asc" }],
      take: MAX_MOVEMENTS
    }),
    db.inventoryMovement.findMany({
      where: scope,
      select: {
        id: true,
        productServiceId: true,
        locationId: true,
        kind: true,
        direction: true,
        quantity: true,
        occurredAt: true,
        sourceType: true,
        sourceId: true
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: MAX_MOVEMENTS
    })
  ]);

  return {
    balances: balances.map((balance) => ({
      productServiceId: balance.productServiceId,
      locationId: balance.locationId,
      quantity: Number(balance.quantity)
    })),
    recentMovements: recentMovements.map((movement) => ({
      id: movement.id,
      productServiceId: movement.productServiceId,
      locationId: movement.locationId,
      kind: movement.kind,
      direction: movement.direction,
      quantity: Number(movement.quantity),
      occurredAt: movement.occurredAt.toISOString(),
      sourceType: movement.sourceType,
      sourceId: movement.sourceId
    }))
  };
}
