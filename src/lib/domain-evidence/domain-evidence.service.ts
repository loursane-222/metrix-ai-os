import type {
  DomainEvidenceAdapterResult,
  DomainEvidenceType,
  DomainEvidenceV1,
} from "./contracts";
import { domainEvidenceRepository as repository } from "./domain-evidence.repository";

type EvidenceInput = Omit<
  DomainEvidenceV1,
  "evidenceId" | "organizationId" | "adapterId" | "adapterVersion" | "provenance"
> & { sourceRecordId: string };

function evidence(
  organizationId: string,
  adapterId: string,
  repositoryName: string,
  input: EvidenceInput,
): DomainEvidenceV1 {
  return Object.freeze({
    ...input,
    evidenceId: `${input.sourceDomain}:${input.sourceRecordId}`,
    organizationId,
    adapterId,
    adapterVersion: "1.0",
    provenance: Object.freeze({
      owner: "CANONICAL_DOMAIN_RECORD",
      repository: repositoryName,
    }),
  });
}

async function readDomain<T>(
  sourceDomain: string,
  adapterId: string,
  repositoryName: string,
  read: () => Promise<T[]>,
  map: (row: T) => EvidenceInput,
): Promise<DomainEvidenceAdapterResult> {
  try {
    const rows = await read();
    const mapped = rows.map((row) =>
      evidence((row as { organizationId?: string }).organizationId ?? "", adapterId, repositoryName, map(row)),
    );
    return Object.freeze({
      sourceDomain,
      connected: true,
      domainState: mapped.length === 0 ? "EMPTY" : "AVAILABLE",
      evidence: Object.freeze(mapped),
      reason: mapped.length === 0
        ? "Canonical repository connected; domain is empty."
        : "Canonical records loaded through the domain evidence boundary.",
    });
  } catch {
    return Object.freeze({
      sourceDomain,
      connected: false,
      domainState: "FAILED",
      evidence: Object.freeze([]),
      reason: "Canonical domain evidence adapter failed.",
    });
  }
}

function canonical(
  evidenceType: DomainEvidenceType,
  sourceDomain: string,
  sourceRecordId: string,
  observedAt: Date,
  summary: string,
  managementCategory: DomainEvidenceV1["managementCategory"],
  confidence = 0.9,
  projection?: Readonly<Record<string, unknown>>,
): EvidenceInput {
  return {
    evidenceType,
    sourceDomain,
    sourceRecordId,
    observedAt: observedAt.toISOString(),
    verificationStatus: "CANONICAL",
    confidence,
    summary,
    managementCategory,
    ...(projection ? { projection } : {}),
  };
}

export async function readCanonicalDomainEvidence(
  organizationId: string,
): Promise<readonly DomainEvidenceAdapterResult[]> {
  const scoped = <T extends object>(rows: T[]) =>
    rows.map((row) => ({ ...row, organizationId }));

  return Promise.all([
    readDomain("organization", "organization-evidence", "Organization", async () => {
      const row = await repository.organization(organizationId);
      return row ? scoped([row]) : [];
    }, (row) => canonical(
      "ORGANIZATION_RECORD", "organization", row.id, row.updatedAt,
      `industry=${row.industry ?? "unknown"}; size=${row.companySize ?? "unknown"}; country=${row.country ?? "unknown"}; onboarding=${row.onboardingStatus}`,
      "company", 0.98,
    )),
    readDomain("customers", "customer-evidence", "Customer", async () =>
      scoped(await repository.customers(organizationId)), (row) => canonical(
      "CUSTOMER_RECORD", "customers", row.id, row.updatedAt,
      `status=${row.status}; currency=${row.currency}; balanceCents=${row.balanceCents}; health=${row.healthScore ?? "unknown"}; tier=${row.tier ?? "unknown"}; source=${row.source}`,
      "customers",
    )),
    readDomain("customer_contacts", "customer-contact-evidence", "CustomerContact", async () =>
      scoped(await repository.customerContacts(organizationId)), (row) => canonical(
      "CUSTOMER_CONTACT_RECORD", "customer_contacts", row.id, row.updatedAt,
      `customerId=${row.customerId}; title=${row.title ?? "unknown"}; primary=${row.isPrimary}; source=${row.source}`,
      "customers",
    )),
    readDomain("customer_terms", "customer-terms-evidence", "CustomerCommercialTerms", async () =>
      scoped(await repository.customerCommercialTerms(organizationId)), (row) => canonical(
      "CUSTOMER_COMMERCIAL_TERMS_RECORD", "customer_terms", row.id, row.updatedAt,
      `customerId=${row.customerId}; paymentTermDays=${row.paymentTermDays ?? "unknown"}; creditLimitCents=${row.creditLimitCents ?? "unknown"}; currency=${row.defaultCurrency ?? "unknown"}; deliveryTerm=${row.deliveryTerm ?? "unknown"}`,
      "finance",
    )),
    readDomain("products", "product-evidence", "ProductService", async () =>
      scoped(await repository.products(organizationId)), (row) => canonical(
      "PRODUCT_RECORD", "products", row.id, row.updatedAt,
      `type=${row.type}; category=${row.category ?? "unknown"}; unit=${row.unit ?? "unknown"}; currency=${row.currency}; stockBehavior=${row.stockBehavior ?? "unknown"}`,
      "operations",
    )),
    readDomain("quotes", "quote-evidence", "Quote", async () =>
      scoped(await repository.quotes(organizationId)), (row) => canonical(
      "QUOTE_RECORD", "quotes", row.id, row.updatedAt,
      `status=${row.status}; amount=${row.amount ?? "unknown"}; currency=${row.currency}; sent=${Boolean(row.sentAt)}; viewed=${Boolean(row.viewedAt)}; won=${Boolean(row.wonAt)}; lost=${Boolean(row.lostAt)}`,
      "sales", 0.9, {
        status: row.status,
        amount: Number(row.amount ?? 0),
        customerName: row.customerName,
        title: row.title,
        sentAt: row.sentAt?.toISOString() ?? null,
        viewedAt: row.viewedAt?.toISOString() ?? null,
        wonAt: row.wonAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    )),
    readDomain("payments", "payment-evidence", "Payment", async () =>
      scoped(await repository.payments(organizationId)), (row) => canonical(
      "PAYMENT_RECORD", "payments", row.id, row.updatedAt,
      `status=${row.status}; amount=${row.amount}; paidAmount=${row.paidAmount}; currency=${row.currency}; dueDate=${row.dueDate?.toISOString() ?? "unknown"}; paid=${Boolean(row.paidAt)}`,
      "finance", 0.9, {
        title: row.title,
        status: row.status,
        amount: Number(row.amount),
        paidAmount: Number(row.paidAmount),
        dueDate: row.dueDate?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
      },
    )),
    readDomain("collections", "collection-evidence", "CollectionAction", async () =>
      scoped(await repository.collections(organizationId)), (row) => canonical(
      "COLLECTION_RECORD", "collections", row.id, row.updatedAt,
      `paymentId=${row.paymentId}; actionType=${row.actionType}; status=${row.status}; source=${row.source}; priority=${row.priority}; dueDate=${row.dueDate?.toISOString() ?? "unknown"}`,
      "finance", 0.9, {
        title: row.title,
        paymentId: row.paymentId,
        actionType: row.actionType,
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      },
    )),
    readDomain("goals", "goal-evidence", "SalesGoal", async () =>
      scoped(await repository.goals(organizationId)), (row) => canonical(
      "GOAL_RECORD", "goals", row.id, row.updatedAt,
      `period=${row.period}; targetRevenueCents=${row.targetRevenueCents ?? "unknown"}; targetCollectionCents=${row.targetCollectionCents ?? "unknown"}; startsAt=${row.startsAt?.toISOString() ?? "unknown"}; endsAt=${row.endsAt?.toISOString() ?? "unknown"}`,
      "sales", 0.9, {
        title: row.title,
        period: row.period,
        targetRevenueCents: row.targetRevenueCents?.toString() ?? null,
        targetCollectionCents: row.targetCollectionCents?.toString() ?? null,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
      },
    )),
    readDomain("tasks", "task-evidence", "Task", async () =>
      scoped(await repository.tasks(organizationId)), (row) => canonical(
      "TASK_RECORD", "tasks", row.id, row.updatedAt,
      `status=${row.status}; priority=${row.priority}; dueDate=${row.dueDate?.toISOString() ?? "unknown"}; assignee=${row.assigneeUserId ?? "unassigned"}`,
      "operations", 0.9, {
        title: row.title,
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate?.toISOString() ?? null,
        assigneeUserId: row.assigneeUserId,
      },
    )),
    readDomain("executive_actions", "executive-action-evidence", "ExecutiveAction", async () =>
      scoped(await repository.executiveActions(organizationId)), (row) => canonical(
      row.completedAt ? "EXECUTIVE_ACTION_RESULT" : "EXECUTIVE_ACTION_RECORD",
      "executive_actions", row.id, row.updatedAt,
      `sourceType=${row.sourceType}; priority=${row.priority}; ownerType=${row.ownerType}; status=${row.status}; dueDate=${row.dueDate?.toISOString() ?? "unknown"}; outcome=${row.outcomeStatus ?? "unknown"}`,
      "operations", 0.9, {
        title: row.title,
        reason: row.reason,
        sourceType: row.sourceType,
        priority: row.priority,
        ownerType: row.ownerType,
        status: row.status,
        dueDate: row.dueDate?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        outcomeStatus: row.outcomeStatus,
      },
    )),
    readDomain("executive_decisions", "executive-decision-evidence", "ExecutiveDecisionRecord", async () =>
      scoped(await repository.executiveDecisions(organizationId)), (row) => canonical(
      "PRIOR_EXECUTIVE_DECISION", "executive_decisions", row.id, row.updatedAt,
      `sourceType=${row.sourceType}; category=${row.category ?? "unknown"}; priority=${row.priority ?? "unknown"}; status=${row.status}; confidence=${row.confidenceScore ?? "unknown"}; decisionDate=${row.decisionDate}`,
      "company", 0.9, {
        title: row.title,
        rationale: row.rationale,
        actionHint: row.actionHint,
        category: row.category,
        priority: row.priority,
        status: row.status,
        followUpDueAt: row.followUpDueAt?.toISOString() ?? null,
        decisionDate: row.decisionDate,
      },
    )),
    readDomain("executive_outcomes", "executive-outcome-evidence", "ExecutiveDecisionOutcome", async () =>
      scoped(await repository.executiveOutcomes(organizationId)), (row) => canonical(
      "EXECUTIVE_OUTCOME_RECORD", "executive_outcomes", row.id, row.occurredAt,
      `decisionRecordId=${row.decisionRecordId}; outcome=${row.outcome}`,
      "company", 0.9, {
        decisionRecordId: row.decisionRecordId,
        outcome: row.outcome,
        summary: row.summary,
        occurredAt: row.occurredAt.toISOString(),
      },
    )),
    readDomain("verified_memory", "verified-memory-evidence", "MemoryItem", async () =>
      scoped(await repository.verifiedCompanyMemories(organizationId)), (row) => ({
      ...canonical(
        "VERIFIED_COMPANY_MEMORY", "verified_memory", row.id, row.updatedAt,
        `${row.key}=${row.value}`, "memory", Math.max(0, Math.min(1, row.confidence / 100)),
      ),
      verificationStatus: "USER_CONFIRMED",
    })),
  ]);
}
