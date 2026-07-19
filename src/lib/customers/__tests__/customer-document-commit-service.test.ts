import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), updateMany: vi.fn() }));
vi.mock("../customer-document-attachment.service", () => ({ resolveCustomerAttachment: mocks.resolve }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { customerDocumentAttachment: { updateMany: mocks.updateMany } } }));

import { claimReviewedCustomerDocument, completeReviewedCustomerDocument, failReviewedCustomerDocument } from "../customer-document-commit-service";

const attachment = { id: "attachment-1", extractionStatus: "COMPLETED", reviewStatus: "READY", draftId: "draft-1", correlationId: "corr-1", committedCustomerId: null, commitResult: null, extractionPayload: { candidates: [{ fieldId: "customer.displayName", normalizedValue: "Acme" }, { fieldId: "customer.custom.field-1", normalizedValue: "Gold" }], duplicates: [] }, reviewPayload: { accepted: ["customer.displayName", "customer.custom.field-1"], rejected: [], edits: { "customer.displayName": "Acme Corrected" } } };

describe("customer document reviewed draft commit authority", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(attachment); mocks.updateMany.mockResolvedValue({ count: 1 }); });

  it("claims only a reviewed READY draft whose corrected values match customer.create", async () => {
    const result = await claimReviewedCustomerDocument({ organizationId: "org-1", actorId: "actor-1", attachmentRef: "attachment-1", customer: { displayName: "Acme Corrected", customFields: [{ definitionId: "field-1", value: "Gold" }] } });
    expect(result).toMatchObject({ kind: "CLAIMED", correlationId: "corr-1", draftId: "draft-1" });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reviewStatus: "READY", committedCustomerId: null }), data: { reviewStatus: "COMMITTING" } }));
  });

  it("rejects an unreviewed value and never claims execution", async () => {
    await expect(claimReviewedCustomerDocument({ organizationId: "org-1", actorId: "actor-1", attachmentRef: "attachment-1", customer: { displayName: "Tampered", customFields: [{ definitionId: "field-1", value: "Gold" }] } })).rejects.toThrow("no longer matches");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("returns the real stored Action Runtime result on an idempotent repeat", async () => {
    mocks.resolve.mockResolvedValue({ ...attachment, reviewStatus: "COMMITTED", committedCustomerId: "customer-1", commitResult: { executionId: "execution-1", entityRef: { entityType: "customer", entityId: "customer-1" } } });
    await expect(claimReviewedCustomerDocument({ organizationId: "org-1", actorId: "actor-1", attachmentRef: "attachment-1", customer: { displayName: "Acme Corrected" } })).resolves.toMatchObject({ kind: "REPLAY", execution: { executionId: "execution-1" } });
  });

  it("stores the execution/customer identity after success and releases a failed claim", async () => {
    await completeReviewedCustomerDocument({ organizationId: "org-1", actorId: "actor-1", attachmentRef: "attachment-1", execution: { actionName: "customer.create", executionId: "execution-1", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "corr-1", operationId: "operation-1", entityRef: { entityType: "customer", entityId: "customer-1" } } });
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewStatus: "COMMITTED", committedCustomerId: "customer-1", commitExecutionId: "execution-1" }) }));
    await failReviewedCustomerDocument({ organizationId: "org-1", actorId: "actor-1", attachmentRef: "attachment-1" });
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ reviewStatus: "COMMITTING", committedCustomerId: null }), data: { reviewStatus: "READY" } }));
  });
});
