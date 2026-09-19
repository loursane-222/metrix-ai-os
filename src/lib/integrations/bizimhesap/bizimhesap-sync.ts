// Read-first/shadow sync: BizimHesap product/warehouse snapshots become
// NEXT canonical ProductService/Location rows, identity-mapped through
// ExternalSourceBinding — never a second independent truth for the same
// real-world entity, and never a writeback. Idempotent: re-running finds
// the existing binding and updates the already-materialized resource
// instead of creating a duplicate.

import { db } from "../../db";
import {
  type BizimHesapCredentials,
  type BizimHesapRecord,
  type FetchLike,
  bizimHesapListProducts,
  bizimHesapListWarehouses
} from "./bizimhesap-client";
import {
  RECORD_ID_KEYS,
  RECORD_NAME_KEYS,
  describeBizimHesapSchema,
  logBizimHesapSchema
} from "./bizimhesap-schema-diagnostic";

const SOURCE_SYSTEM = "bizimhesap";

// ExternalSourceBinding is unique on (organization, sourceSystem,
// externalId) — resourceType is not part of it — so a warehouse and a
// product that both carry the provider id "1" would otherwise collide on
// one binding row. The external id is therefore kind-qualified.
function bindingExternalId(
  kind: "warehouse" | "product",
  externalId: string
): string {
  return `${kind}:${externalId}`;
}

export class BizimHesapUnrecognizedRecordsError extends Error {
  readonly code = "BIZIMHESAP_UNRECOGNIZED_RECORDS";

  constructor() {
    super("BizimHesap returned records with no recognizable id/name");
    this.name = "BizimHesapUnrecognizedRecordsError";
  }
}

export type BizimHesapSyncResult = {
  locationsCreated: number;
  locationsUpdated: number;
  locationsSkipped: number;
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
};

function extractExternalId(record: BizimHesapRecord): string | null {
  for (const key of RECORD_ID_KEYS) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return null;
}

function extractName(record: BizimHesapRecord): string | null {
  for (const key of RECORD_NAME_KEYS) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

async function upsertLocationFromExternal(
  organizationId: string,
  record: BizimHesapRecord
): Promise<"created" | "updated" | "skipped"> {
  const externalId = extractExternalId(record);
  const name = extractName(record);

  if (!externalId || !name) {
    return "skipped";
  }

  const bindingId = bindingExternalId("warehouse", externalId);

  const existingBinding = await db.externalSourceBinding.findUnique({
    where: {
      organizationId_sourceSystem_externalId: {
        organizationId,
        sourceSystem: SOURCE_SYSTEM,
        externalId: bindingId
      }
    }
  });

  if (existingBinding) {
    await db.location.update({
      where: { id: existingBinding.resourceId },
      data: { name }
    });

    await db.externalSourceBinding.update({
      where: { id: existingBinding.id },
      data: { lastSyncedAt: new Date() }
    });

    return "updated";
  }

  const location = await db.location.create({
    data: {
      organizationId,
      name,
      kind: "WAREHOUSE",
      externalId
    }
  });

  await db.externalSourceBinding.create({
    data: {
      organizationId,
      resourceType: "Location",
      resourceId: location.id,
      sourceSystem: SOURCE_SYSTEM,
      externalId: bindingId,
      lastSyncedAt: new Date()
    }
  });

  return "created";
}

async function upsertProductServiceFromExternal(
  organizationId: string,
  record: BizimHesapRecord
): Promise<"created" | "updated" | "skipped"> {
  const externalId = extractExternalId(record);
  const name = extractName(record);

  if (!externalId || !name) {
    return "skipped";
  }

  const bindingId = bindingExternalId("product", externalId);

  const existingBinding = await db.externalSourceBinding.findUnique({
    where: {
      organizationId_sourceSystem_externalId: {
        organizationId,
        sourceSystem: SOURCE_SYSTEM,
        externalId: bindingId
      }
    }
  });

  if (existingBinding) {
    await db.productService.update({
      where: { id: existingBinding.resourceId },
      data: { name }
    });

    await db.externalSourceBinding.update({
      where: { id: existingBinding.id },
      data: { lastSyncedAt: new Date() }
    });

    return "updated";
  }

  const productService = await db.productService.create({
    data: {
      organizationId,
      name,
      type: "PRODUCT",
      status: "ACTIVE"
    }
  });

  await db.externalSourceBinding.create({
    data: {
      organizationId,
      resourceType: "ProductService",
      resourceId: productService.id,
      sourceSystem: SOURCE_SYSTEM,
      externalId: bindingId,
      lastSyncedAt: new Date()
    }
  });

  return "created";
}

export async function syncBizimHesapCatalog(input: {
  organizationId: string;
  credentials: BizimHesapCredentials;
  fetchImpl?: FetchLike;
}): Promise<BizimHesapSyncResult> {
  const result: BizimHesapSyncResult = {
    locationsCreated: 0,
    locationsUpdated: 0,
    locationsSkipped: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsSkipped: 0
  };

  const warehouses = await bizimHesapListWarehouses(
    input.credentials,
    input.fetchImpl
  );

  for (const warehouse of warehouses) {
    const outcome = await upsertLocationFromExternal(
      input.organizationId,
      warehouse
    );

    if (outcome === "created") result.locationsCreated += 1;
    else if (outcome === "updated") result.locationsUpdated += 1;
    else result.locationsSkipped += 1;
  }

  // Warehouse/product record shapes are undocumented by BizimHesap. If it
  // returned records and NONE could be identified, the mapping does not
  // fit the real account — that is a failed preparation, not "0 items".
  if (warehouses.length > 0 && result.locationsSkipped === warehouses.length) {
    logBizimHesapSchema(describeBizimHesapSchema("/warehouses", warehouses));
    throw new BizimHesapUnrecognizedRecordsError();
  }

  const products = await bizimHesapListProducts(
    input.credentials,
    input.fetchImpl
  );

  for (const product of products) {
    const outcome = await upsertProductServiceFromExternal(
      input.organizationId,
      product
    );

    if (outcome === "created") result.productsCreated += 1;
    else if (outcome === "updated") result.productsUpdated += 1;
    else result.productsSkipped += 1;
  }

  if (products.length > 0 && result.productsSkipped === products.length) {
    logBizimHesapSchema(describeBizimHesapSchema("/products", products));
    throw new BizimHesapUnrecognizedRecordsError();
  }

  return result;
}
