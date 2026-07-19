import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), get: vi.fn(), execute: vi.fn() }));
vi.mock("../customer-document-attachment.service", () => ({ resolveCustomerAttachment: mocks.resolve }));
vi.mock("@/lib/core/customers/customer.service", () => ({ getCustomerByIdForOrganization: mocks.get }));
vi.mock("@/lib/action-runtime/gateway/customer-update-gateway", () => ({ executeCustomerUpdateGateway: mocks.execute }));

import { executeDocumentDuplicateUpdate } from "../customer-document-duplicate-update-service";

describe("document duplicate to real customer.update orchestration", () => {
  beforeEach(() => vi.clearAllMocks());
  it("derives expectedVersion from persisted customer and verifies resultingVersion after Action Runtime", async () => {
    mocks.resolve.mockResolvedValue({ extractionStatus: "COMPLETED", reviewStatus: "READY", correlationId: "corr-1", reviewPayload: { accepted: ["customer.phone"], edits: { "customer.phone": "+905551112233" } }, extractionPayload: { candidates: [{ fieldId: "customer.phone", normalizedValue: "+900000000000" }], duplicates: [{ customerId: "customer-1", strength: "STRONG" }] } });
    mocks.get.mockResolvedValueOnce({ id: "customer-1", updatedAt: new Date("2026-07-19T10:00:00Z") }).mockResolvedValueOnce({ id: "customer-1", updatedAt: new Date("2026-07-19T10:01:00Z") });
    mocks.execute.mockResolvedValue({ executionId: "execution-1", status: "SUCCESS" });
    const authContext = { organization: { id: "org-1" }, user: { id: "actor-1" } } as never;
    const result = await executeDocumentDuplicateUpdate({ authContext, attachmentRef: "attachment-1", customerId: "customer-1", idempotencyKey: "idem-1" });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ customerId: "customer-1", expectedVersion: "2026-07-19T10:00:00.000Z", patch: { phone: "+905551112233" }, correlationId: "corr-1" }));
    expect(result).toMatchObject({ expectedVersion: "2026-07-19T10:00:00.000Z", resultingVersion: "2026-07-19T10:01:00.000Z", customerId: "customer-1" });
  });

  it("rejects a customer id that did not come from strong persisted duplicate resolution", async () => {
    mocks.resolve.mockResolvedValue({ extractionStatus: "COMPLETED", reviewStatus: "READY", reviewPayload: { accepted: [] }, extractionPayload: { candidates: [], duplicates: [{ customerId: "customer-other", strength: "STRONG" }] } });
    await expect(executeDocumentDuplicateUpdate({ authContext: { organization: { id: "org-1" }, user: { id: "actor-1" } } as never, attachmentRef: "attachment-1", customerId: "customer-1", idempotencyKey: "idem-1" })).rejects.toThrow("trusted duplicate");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
