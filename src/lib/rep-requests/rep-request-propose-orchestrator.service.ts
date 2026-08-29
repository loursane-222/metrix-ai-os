import { randomUUID } from "crypto";
import type { OrganizationRole } from "@prisma/client";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { notify } from "@/lib/core/notifications/notification.service";
import { persistBusinessPropositions } from "@/lib/business-reality-candidates";
import { parseRepRequest } from "./rep-request-parser.service";
import { repRequestDomainLabel, targetDomainForRepRequestDomain } from "./rep-request.repository";
import type { RepRequestDomain } from "./rep-request.types";

// Same tier as this session's other manager-only gates — the review side of
// this flow is manager-only, but proposing is intentionally open to anyone
// (it never mutates real state on its own).
const MANAGER_ROLES: readonly OrganizationRole[] = ["TEAM_LEAD", "MANAGER", "EXECUTIVE", "OWNER"];

const NOTIFICATION_TYPE = "REP_REQUEST_PROPOSED";
const NOTIFICATION_ENTITY_TYPE = "BusinessCandidate";

export type RepRequestProposeOutcome =
  | Readonly<{ status: "PARSE_FAILED" }>
  | Readonly<{ status: "CUSTOMER_NOT_FOUND"; customerNameRaw: string }>
  | Readonly<{ status: "CUSTOMER_AMBIGUOUS"; customerNameRaw: string; options: readonly string[] }>
  | Readonly<{ status: "PROPOSED"; domain: RepRequestDomain; customerNameRaw: string }>;

function requiresTitleAndAmount(domain: RepRequestDomain): boolean {
  return domain === "QUOTE" || domain === "PAYMENT";
}

export async function proposeRepRequest(input: { authContext: AuthContext; domain: RepRequestDomain; message: string }): Promise<RepRequestProposeOutcome> {
  const organizationId = input.authContext.organization.id;

  const extraction = await parseRepRequest({ domain: input.domain, message: input.message });
  if (!extraction) return { status: "PARSE_FAILED" };
  if (requiresTitleAndAmount(input.domain) && (extraction.title === null || extraction.amount === null)) return { status: "PARSE_FAILED" };

  const customers = await listCustomers({ organizationId, limit: 5000 });
  const resolution = resolveCustomerReference(customers, extraction.customerNameRaw);
  if (resolution.status === "NOT_FOUND") return { status: "CUSTOMER_NOT_FOUND", customerNameRaw: extraction.customerNameRaw };
  if (resolution.status === "AMBIGUOUS") return { status: "CUSTOMER_AMBIGUOUS", customerNameRaw: extraction.customerNameRaw, options: resolution.options.map((option) => option.displayName) };

  const changes = [
    { fieldPath: "customerId", proposedValue: resolution.customer.id },
    { fieldPath: "customerNameRaw", proposedValue: resolution.customer.displayName },
    ...(extraction.title !== null ? [{ fieldPath: "title", proposedValue: extraction.title }] : []),
    // executor's optionalNumber only accepts a string proposedValue
    // (business-candidate-action-runtime.executor.ts:489-494) — a raw
    // number here would silently fail promotion with
    // BUSINESS_CANDIDATE_REQUIRED_FIELD_AMOUNT.
    ...(extraction.amount !== null ? [{ fieldPath: "amount", proposedValue: String(extraction.amount) }] : []),
    ...(extraction.currency !== null ? [{ fieldPath: "currency", proposedValue: extraction.currency }] : []),
    ...(extraction.notes !== null ? [{ fieldPath: "notes", proposedValue: extraction.notes }] : []),
    ...(extraction.deadlineAt !== null ? [{ fieldPath: "deadlineAt", proposedValue: extraction.deadlineAt }] : []),
  ];

  await persistBusinessPropositions({
    organizationId,
    sourceChannel: "TEXT",
    sourceInputId: randomUUID(),
    propositions: [{
      propositionId: randomUUID(),
      propositionType: `${input.domain}_REQUEST`,
      targetDomain: targetDomainForRepRequestDomain(input.domain),
      targetRecordId: null,
      entityResolutionStatus: "NEW_ENTITY",
      operation: "CREATE",
      confidence: 1,
      requiresApproval: true,
      verificationRequired: false,
      provenance: { proposedByUserId: input.authContext.user.id, channel: "chat" },
      changes,
    }],
  });

  const managers = (await listActiveNotificationRecipientRecords(organizationId)).filter((member) => MANAGER_ROLES.includes(member.role));
  const requesterName = input.authContext.user.fullName ?? "Bir çalışan";
  await Promise.all(managers.map((manager) => notify({
    organizationId,
    recipientUserId: manager.userId,
    type: NOTIFICATION_TYPE,
    title: `${requesterName} yeni bir ${repRequestDomainLabel(input.domain).toLocaleLowerCase("tr-TR")} talebi gönderdi`,
    body: `${resolution.customer.displayName}${extraction.amount !== null ? `, ${extraction.amount.toLocaleString("tr-TR")} TL` : ""}`,
    entityType: NOTIFICATION_ENTITY_TYPE,
    entityId: resolution.customer.id,
  })));

  return { status: "PROPOSED", domain: input.domain, customerNameRaw: resolution.customer.displayName };
}
