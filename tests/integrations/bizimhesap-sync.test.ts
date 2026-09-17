import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { syncBizimHesapCatalog } from "../../src/lib/integrations/bizimhesap/bizimhesap-sync";
import type { FetchLike } from "../../src/lib/integrations/bizimhesap/bizimhesap-client";

const ORIGINAL_PARTNER_KEY = process.env.BIZIMHESAP_PARTNER_KEY;

beforeEach(() => {
  process.env.BIZIMHESAP_PARTNER_KEY = "test-partner-key";
});

function mockFetch(
  byPath: Record<string, unknown>
): FetchLike {
  return async (url) => {
    const path = new URL(url).pathname.replace("/api/b2b", "");

    return {
      ok: true,
      status: 200,
      json: async () => byPath[path] ?? []
    };
  };
}

describe(
  "BizimHesap read-first sync (idempotent identity resolution)",
  () => {
    it(
      "materializes NEXT canonical Location/ProductService rows on first sync, then updates (never duplicates) on re-sync",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const organizationId = `bh-org-${suffix}`;

        await db.organization.create({
          data: { id: organizationId, name: "BizimHesap Tenant" }
        });

        const fetchImpl = mockFetch({
          "/warehouses": [{ id: "wh-1", name: "Merkez Depo" }],
          "/products": [{ id: "pr-1", name: "Ürün A" }]
        });

        try {
          const first = await syncBizimHesapCatalog({
            organizationId,
            credentials: { token: "t" },
            fetchImpl
          });

          expect(first.locationsCreated).toBe(1);
          expect(first.productsCreated).toBe(1);

          const locationCount = await db.location.count({
            where: { organizationId }
          });
          const productCount = await db.productService.count({
            where: { organizationId }
          });
          expect(locationCount).toBe(1);
          expect(productCount).toBe(1);

          const bindingCount = await db.externalSourceBinding.count({
            where: { organizationId, sourceSystem: "bizimhesap" }
          });
          expect(bindingCount).toBe(2);

          // re-sync with a renamed warehouse: must UPDATE the same
          // canonical row, never create a second one
          const renamedFetch = mockFetch({
            "/warehouses": [{ id: "wh-1", name: "Merkez Depo (Yeni)" }],
            "/products": [{ id: "pr-1", name: "Ürün A" }]
          });

          const second = await syncBizimHesapCatalog({
            organizationId,
            credentials: { token: "t" },
            fetchImpl: renamedFetch
          });

          expect(second.locationsUpdated).toBe(1);
          expect(second.locationsCreated).toBe(0);

          const locationCountAfterResync = await db.location.count({
            where: { organizationId }
          });
          expect(locationCountAfterResync).toBe(1);

          const location = await db.location.findFirst({
            where: { organizationId }
          });
          expect(location?.name).toBe("Merkez Depo (Yeni)");

          const bindingCountAfterResync =
            await db.externalSourceBinding.count({
              where: { organizationId, sourceSystem: "bizimhesap" }
            });
          expect(bindingCountAfterResync).toBe(2);
        } finally {
          await db.externalSourceBinding.deleteMany({
            where: { organizationId }
          });
          await db.productService.deleteMany({
            where: { organizationId }
          });
          await db.location.deleteMany({ where: { organizationId } });
          await db.organization.deleteMany({
            where: { id: organizationId }
          });
        }
      }
    );

    it(
      "skips a record with no resolvable external id/name rather than crashing or writing garbage",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-skip`;
        const organizationId = `bh-skip-org-${suffix}`;

        await db.organization.create({
          data: { id: organizationId, name: "BizimHesap Skip Tenant" }
        });

        const fetchImpl = mockFetch({
          "/warehouses": [{ unrelatedField: 42 }],
          "/products": []
        });

        try {
          const result = await syncBizimHesapCatalog({
            organizationId,
            credentials: { token: "t" },
            fetchImpl
          });

          expect(result.locationsSkipped).toBe(1);
          expect(result.locationsCreated).toBe(0);

          const locationCount = await db.location.count({
            where: { organizationId }
          });
          expect(locationCount).toBe(0);
        } finally {
          await db.organization.deleteMany({
            where: { id: organizationId }
          });
        }
      }
    );
  }
);

afterAll(async () => {
  process.env.BIZIMHESAP_PARTNER_KEY = ORIGINAL_PARTNER_KEY;
  await db.$disconnect();
});
