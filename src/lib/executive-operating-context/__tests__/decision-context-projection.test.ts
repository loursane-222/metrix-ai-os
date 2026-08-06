import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import type { DomainEvidenceV1 } from "@/lib/domain-evidence";
import { projectDecisionContext } from "../executive-operating-context-builder.service";

const now = new Date("2026-08-06T09:00:00Z");

function decisionEvidence(input: {
  id: string;
  title: string;
  category: string;
  status?: string;
}): DomainEvidenceV1 {
  return {
    evidenceId: `executive_decisions:${input.id}`,
    evidenceType: "PRIOR_EXECUTIVE_DECISION",
    sourceDomain: "executive_decisions",
    sourceRecordId: input.id,
    organizationId: "org-1",
    observedAt: now.toISOString(),
    verificationStatus: "CANONICAL",
    provenance: { owner: "CANONICAL_DOMAIN_RECORD", repository: "ExecutiveDecisionRecord" },
    adapterId: "executive-decision-evidence",
    adapterVersion: "1.0",
    confidence: 0.9,
    summary: "canonical decision",
    managementCategory: "company",
    projection: {
      title: input.title,
      rationale: "Gerekçe",
      actionHint: "Aksiyon",
      category: input.category,
      priority: "HIGH",
      status: input.status ?? "PROPOSED",
      decisionDate: "2026-08-06",
    },
  };
}

describe("projectDecisionContext", () => {
  it("deduplicates open records by normalized title and category", () => {
    const context = projectDecisionContext([
      decisionEvidence({ id: "new", title: "Tahsilat netleşmeden yeni risk alma", category: "FINANCE" }),
      decisionEvidence({ id: "old", title: "  TAHSİLAT NETLEŞMEDEN YENİ RİSK ALMA ", category: "FINANCE" }),
      decisionEvidence({ id: "other", title: "Tahsilat netleşmeden yeni risk alma", category: "CUSTOMER" }),
    ], now);

    expect(context.openDecisions.map((decision) => decision.id)).toEqual(["new", "other"]);
  });

  it("keeps committed history intact while deduplicating the visible open projection", () => {
    const evidence = [
      decisionEvidence({ id: "committed-1", title: "Aynı karar", category: "FINANCE", status: "COMMITTED" }),
      decisionEvidence({ id: "committed-2", title: "Aynı karar", category: "FINANCE", status: "COMMITTED" }),
    ];

    const context = projectDecisionContext(evidence, now);

    expect(context.openDecisions).toHaveLength(1);
    expect(context.committedDecisions).toHaveLength(2);
  });
});
