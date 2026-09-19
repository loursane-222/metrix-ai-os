import { afterAll, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";
import {
  BizimHesapUnrecognizedRecordsError,
  syncBizimHesapCatalog
} from "../../src/lib/integrations/bizimhesap/bizimhesap-sync";
import type { FetchLike } from "../../src/lib/integrations/bizimhesap/bizimhesap-client";

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
      "skips one unidentifiable record among identifiable ones rather than crashing or writing garbage",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-skip`;
        const organizationId = `bh-skip-org-${suffix}`;

        await db.organization.create({
          data: { id: organizationId, name: "BizimHesap Skip Tenant" }
        });

        const fetchImpl = mockFetch({
          "/warehouses": [{ unrelatedField: 42 }, { id: "wh-1", name: "Depo" }],
          "/products": []
        });

        try {
          const result = await syncBizimHesapCatalog({
            organizationId,
            credentials: { token: "t" },
            fetchImpl
          });

          expect(result.locationsSkipped).toBe(1);
          expect(result.locationsCreated).toBe(1);
        } finally {
          await db.externalSourceBinding.deleteMany({ where: { organizationId } });
          await db.location.deleteMany({ where: { organizationId } });
          await db.organization.deleteMany({
            where: { id: organizationId }
          });
        }
      }
    );

    it(
      "fails loudly (never a silent 0-item success) when records come back but none can be identified",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-unrec`;
        const organizationId = `bh-unrec-org-${suffix}`;

        await db.organization.create({
          data: { id: organizationId, name: "BizimHesap Unrecognized Tenant" }
        });

        try {
          await expect(
            syncBizimHesapCatalog({
              organizationId,
              credentials: { token: "t" },
              fetchImpl: mockFetch({
                "/warehouses": [{ unrelatedField: 42 }],
                "/products": []
              })
            })
          ).rejects.toBeInstanceOf(BizimHesapUnrecognizedRecordsError);

          expect(await db.location.count({ where: { organizationId } })).toBe(0);
        } finally {
          await db.organization.deleteMany({ where: { id: organizationId } });
        }
      }
    );

    it(
      "reports which fields the parser looked for and which keys arrived — names only, never values",
      async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-diag`;
        const organizationId = `bh-diag-org-${suffix}`;

        await db.organization.create({
          data: { id: organizationId, name: "BizimHesap Diagnostic Tenant" }
        });

        try {
          await expect(
            syncBizimHesapCatalog({
              organizationId,
              credentials: { token: "t" },
              fetchImpl: mockFetch({
                "/warehouses": [{ depoKodu: "VALUE-SENTINEL-1", depoAdi: "VALUE-SENTINEL-2" }],
                "/products": []
              })
            })
          ).rejects.toBeInstanceOf(BizimHesapUnrecognizedRecordsError);

          const logged = JSON.stringify(warn.mock.calls);
          expect(logged).toContain("depoKodu");
          expect(logged).toContain("depoAdi");
          expect(logged).toContain('\\"recognizedId\\":null');
          expect(logged).not.toContain("VALUE-SENTINEL");
        } finally {
          warn.mockRestore();
          await db.organization.deleteMany({ where: { id: organizationId } });
        }
      }
    );

    it(
      "a warehouse and a product carrying the same provider id stay two separate canonical rows, idempotently",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-collide`;
        const organizationId = `bh-collide-org-${suffix}`;

        await db.organization.create({
          data: { id: organizationId, name: "BizimHesap Collide Tenant" }
        });

        const fetchImpl = mockFetch({
          "/warehouses": [{ id: 1, name: "Depo Bir" }],
          "/products": [{ id: 1, name: "Ürün Bir" }]
        });

        try {
          for (let run = 0; run < 3; run += 1) {
            await syncBizimHesapCatalog({
              organizationId,
              credentials: { token: "t" },
              fetchImpl
            });
          }

          expect(await db.location.count({ where: { organizationId } })).toBe(1);
          expect(await db.productService.count({ where: { organizationId } })).toBe(1);
          expect(
            await db.externalSourceBinding.count({
              where: { organizationId, sourceSystem: "bizimhesap" }
            })
          ).toBe(2);
          expect(
            (await db.productService.findFirstOrThrow({ where: { organizationId } })).name
          ).toBe("Ürün Bir");
          expect(
            (await db.location.findFirstOrThrow({ where: { organizationId } })).name
          ).toBe("Depo Bir");
        } finally {
          await db.externalSourceBinding.deleteMany({ where: { organizationId } });
          await db.productService.deleteMany({ where: { organizationId } });
          await db.location.deleteMany({ where: { organizationId } });
          await db.organization.deleteMany({ where: { id: organizationId } });
        }
      }
    );
  }
);

afterAll(async () => {
  await db.$disconnect();
});
