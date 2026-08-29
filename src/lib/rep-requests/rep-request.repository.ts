import { prisma } from "@/lib/core/shared/prisma";
import type { RepRequestDomain } from "./rep-request.types";

const TARGET_DOMAIN_BY_REQUEST_DOMAIN: Record<RepRequestDomain, string> = {
  ORDER: "Order",
  QUOTE: "Quote",
  PAYMENT: "Payment",
};

function proposedByUserId(provenanceJson: unknown): string | null {
  if (!provenanceJson || typeof provenanceJson !== "object" || Array.isArray(provenanceJson)) return null;
  const value = (provenanceJson as Record<string, unknown>).proposedByUserId;
  return typeof value === "string" && value ? value : null;
}

/**
 * All PENDING_APPROVAL Order/Quote/Payment candidates proposed (via
 * provenanceJson.proposedByUserId — no dedicated column, see plan) by this
 * rep. Small result set per org in practice, so filtering by proposer
 * happens in application code rather than a Prisma JSON-path query.
 */
export async function findPendingRepRequestCandidates(organizationId: string, proposerUserId: string) {
  const candidates = await prisma.businessCandidate.findMany({
    where: {
      organizationId,
      status: "PENDING_APPROVAL",
      targetDomain: { in: Object.values(TARGET_DOMAIN_BY_REQUEST_DOMAIN) },
    },
    include: { changes: true },
    orderBy: { createdAt: "desc" },
  });
  return candidates.filter((candidate) => proposedByUserId(candidate.provenanceJson) === proposerUserId);
}

export function targetDomainForRepRequestDomain(domain: RepRequestDomain): string {
  return TARGET_DOMAIN_BY_REQUEST_DOMAIN[domain];
}

const REQUEST_DOMAIN_BY_TARGET_DOMAIN: Record<string, RepRequestDomain> = { Order: "ORDER", Quote: "QUOTE", Payment: "PAYMENT" };

export function repRequestDomainForTargetDomain(targetDomain: string): RepRequestDomain | null {
  return REQUEST_DOMAIN_BY_TARGET_DOMAIN[targetDomain] ?? null;
}

const REQUEST_DOMAIN_LABEL: Record<RepRequestDomain, string> = { ORDER: "Sipariş", QUOTE: "Teklif", PAYMENT: "Tahsilat" };

export function repRequestDomainLabel(domain: RepRequestDomain): string {
  return REQUEST_DOMAIN_LABEL[domain];
}

export function customerNameRawFromChanges(changes: readonly { fieldPath: string; proposedValue: unknown }[]): string | null {
  const change = changes.find((item) => item.fieldPath === "customerNameRaw");
  return typeof change?.proposedValue === "string" ? change.proposedValue : null;
}
