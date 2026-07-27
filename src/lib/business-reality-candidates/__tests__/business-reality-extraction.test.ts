import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessCandidateSourceChannel } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  customerFindMany: vi.fn(),
  productFindMany: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    customer: { findMany: mocks.customerFindMany },
    productService: { findMany: mocks.productFindMany },
  },
}));
vi.mock("../business-candidate.service", () => ({
  persistBusinessPropositions: mocks.persist,
}));

import { extractAndPersistBusinessCandidates } from "../business-reality-extraction.service";

const atlas = {
  id: "customer-atlas",
  displayName: "Atlas",
  legalName: null,
  updatedAt: new Date("2026-07-27T10:00:00.000Z"),
};

describe("semantic Business Reality extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customerFindMany.mockResolvedValue([atlas]);
    mocks.productFindMany.mockResolvedValue([]);
    mocks.persist.mockImplementation(async (input) =>
      input.propositions.map((proposition: { propositionId: string; changes: unknown[] }) => ({
        id: proposition.propositionId,
        changes: proposition.changes,
      }))
    );
  });

  it("splits a real multi-domain utterance into independently persisted propositions", async () => {
    const envelope = JSON.stringify({
      classification: "BUSINESS_COMMAND",
      propositions: [
        {
          propositionType: "COMMERCIAL_TERMS_UPDATE",
          targetDomain: "CustomerCommercialTerms",
          operation: "UPDATE",
          targetName: "Atlas",
          confidence: 0.98,
          verificationRequired: false,
          changes: [{ fieldPath: "paymentTermDays", proposedValue: 45 }],
        },
        {
          propositionType: "PRODUCT_CREATE",
          targetDomain: "ProductService",
          operation: "CREATE",
          targetName: "Granit X",
          confidence: 0.99,
          verificationRequired: false,
          changes: [{ fieldPath: "name", proposedValue: "Granit X" }],
        },
        {
          propositionType: "TASK_CREATE",
          targetDomain: "ExecutiveAction",
          operation: "CREATE",
          targetName: null,
          confidence: 0.95,
          verificationRequired: false,
          changes: [{ fieldPath: "title", proposedValue: "Ahmet'i ara" }],
          taskContext: {
            dueDate: "2026-07-28T09:00:00.000+03:00",
            ownerReference: "Ahmet",
          },
        },
      ],
    });
    const result = await extractAndPersistBusinessCandidates(baseInput("text", envelope));
    const persisted = mocks.persist.mock.calls[0]![0];

    expect(result.candidates).toHaveLength(3);
    expect(persisted.propositions.map((item: { targetDomain: string }) => item.targetDomain))
      .toEqual(["CustomerCommercialTerms", "ProductService", "ExecutiveAction"]);
    expect(persisted.propositions[0].changes).toEqual([
      expect.objectContaining({
        fieldPath: "commercialTerms.paymentTermDays",
        proposedValue: 45,
      }),
    ]);
    expect(persisted.propositions[2].changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldPath: "dueDate" }),
      expect.objectContaining({ fieldPath: "ownerType", proposedValue: "UNASSIGNED" }),
    ]));
  });

  it("keeps multi-field customer terms atomic and independently decidable", async () => {
    const envelope = JSON.stringify({
      classification: "BUSINESS_ASSERTION",
      propositions: [{
        propositionType: "COMMERCIAL_TERMS_UPDATE",
        targetDomain: "CustomerCommercialTerms",
        operation: "UPDATE",
        targetName: "Atlas",
        confidence: 0.97,
        verificationRequired: false,
        changes: [
          { fieldPath: "currency", proposedValue: "EUR" },
          { fieldPath: "paymentTermDays", proposedValue: 45 },
        ],
      }],
    });
    await extractAndPersistBusinessCandidates(baseInput("voice", envelope));
    const proposition = mocks.persist.mock.calls[0]![0].propositions[0];
    expect(proposition.changes.map((change: { fieldPath: string }) => change.fieldPath))
      .toEqual([
        "commercialTerms.defaultCurrency",
        "commercialTerms.paymentTermDays",
      ]);
    expect(proposition.entityResolutionStatus).toBe("RESOLVED");
    expect(proposition.provenance.targetVersion).toBe("2026-07-27T10:00:00.000Z");
  });

  it("canonicalizes model product aliases into an executable create proposition", async () => {
    const envelope = JSON.stringify({
      classification: "BUSINESS_COMMAND",
      propositions: [{
        propositionType: "PRODUCT_ADD",
        targetDomain: "ProductService",
        operation: "UPDATE",
        targetName: "Granit X",
        confidence: 0.96,
        verificationRequired: false,
        changes: [{ fieldPath: "products", proposedValue: "Granit X" }],
      }],
    });

    await extractAndPersistBusinessCandidates(baseInput("text", envelope));
    const proposition = mocks.persist.mock.calls[0]![0].propositions[0];

    expect(proposition).toEqual(expect.objectContaining({
      targetDomain: "ProductService",
      operation: "CREATE",
      entityResolutionStatus: "NEW_ENTITY",
      verificationRequired: false,
    }));
    expect(proposition.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldPath: "name", proposedValue: "Granit X" }),
      expect.objectContaining({ fieldPath: "type", proposedValue: "PRODUCT" }),
    ]));
  });

  it("keeps an explicitly typed executive action out of the contact domain", async () => {
    const envelope = JSON.stringify({
      classification: "BUSINESS_COMMAND",
      propositions: [{
        propositionType: "EXECUTIVE_ACTION",
        targetDomain: "CustomerContact",
        operation: "CREATE",
        targetName: "Ahmet",
        confidence: 0.98,
        verificationRequired: false,
        changes: [{ fieldPath: "title", proposedValue: "Call" }],
        taskContext: {
          dueDate: "2026-07-28T20:00:00.000Z",
          ownerReference: null,
        },
      }],
    });

    await extractAndPersistBusinessCandidates(baseInput("voice", envelope));
    const proposition = mocks.persist.mock.calls[0]![0].propositions[0];

    expect(proposition).toEqual(expect.objectContaining({
      targetDomain: "ExecutiveAction",
      operation: "CREATE",
      entityResolutionStatus: "NEW_ENTITY",
    }));
    expect(proposition.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldPath: "title", proposedValue: "Call Ahmet" }),
      expect.objectContaining({ fieldPath: "dueDate" }),
      expect.objectContaining({ fieldPath: "ownerType", proposedValue: "UNASSIGNED" }),
    ]));
  });

  it("blocks hypothetical and AI-generated inputs without persistence", async () => {
    const hypothetical = JSON.stringify({
      classification: "HYPOTHETICAL",
      propositions: [],
    });
    const userResult = await extractAndPersistBusinessCandidates(baseInput("text", hypothetical));
    const aiResult = await extractAndPersistBusinessCandidates({
      ...baseInput("voice", hypothetical),
      sourceAuthority: "AI",
    });
    expect(userResult.candidates).toEqual([]);
    expect(aiResult.blockedAiGeneratedCount).toBe(1);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("uses identical semantics for text and voice", async () => {
    const envelope = JSON.stringify({
      classification: "BUSINESS_ASSERTION",
      propositions: [{
        propositionType: "CURRENCY_UPDATE",
        targetDomain: "Customer",
        operation: "UPDATE",
        targetName: "Atlas",
        confidence: 0.95,
        verificationRequired: false,
        changes: [{ fieldPath: "currency", proposedValue: "EUR" }],
      }],
    });
    await extractAndPersistBusinessCandidates(baseInput("text", envelope));
    const text = mocks.persist.mock.calls[0]![0].propositions;
    mocks.persist.mockClear();
    await extractAndPersistBusinessCandidates(baseInput("voice", envelope));
    const voice = mocks.persist.mock.calls[0]![0].propositions;
    expect(voice).toEqual(text);
  });
});

function baseInput(channel: "text" | "voice", envelope: string) {
  return {
    organizationId: "org-1",
    conversationId: "conversation-1",
    sourceMessageId: "message-1",
    sourceChannel: channel === "voice"
      ? BusinessCandidateSourceChannel.VOICE
      : BusinessCandidateSourceChannel.TEXT,
    sourceAuthority: "USER" as const,
    message: "redacted",
    requestId: "request-1",
    now: new Date("2026-07-27T12:00:00.000+03:00"),
    generateText: vi.fn().mockResolvedValue(envelope),
  };
}
