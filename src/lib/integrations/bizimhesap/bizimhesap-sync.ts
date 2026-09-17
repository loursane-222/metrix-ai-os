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

const SOURCE_SYSTEM = "bizimhesap";

export type BizimHesapSyncResult = {
  locationsCreated: number;
  locationsUpdated: number;
  locationsSkipped: number;
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
};

function extractExternalId(record: BizimHesapRecord): string | null {
  for (const key of ["id", "Id", "ID", "code", "Code"]) {
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
  for (const key of [
    "name",
    "Name",
    "title",
    "Title",
    "warehouseName",
    "productName"
  ]) {
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

  const existingBinding = await db.externalSourceBinding.findUnique({
    where: {
      organizationId_sourceSystem_externalId: {
        organizationId,
        sourceSystem: SOURCE_SYSTEM,
        externalId
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
      externalId,
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

  const existingBinding = await db.externalSourceBinding.findUnique({
    where: {
      organizationId_sourceSystem_externalId: {
        organizationId,
        sourceSystem: SOURCE_SYSTEM,
        externalId
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
      externalId,
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

  return result;
}
