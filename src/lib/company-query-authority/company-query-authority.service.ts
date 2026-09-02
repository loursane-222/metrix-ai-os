import { resolveCustomerReference, type ResolvableCustomer } from "@/lib/customers/customer-resolution";
import { buildCurrentReceivableDataset } from "@/lib/core/reporting/current-receivable-intelligence.service";
import {
  listActiveCustomers,
  readCommercialTermsForCustomer,
  readConfirmedOrdersForCustomer,
  readConfirmedOrdersInRange,
  readQuotesForCustomer,
  readQuotesSentInRange,
  resolveCompanyQueryDateRange,
  type CustomerCommercialTerms,
  type CustomerOrderRow,
  type CustomerQuoteRow,
} from "./company-query-readers";
import { searchConversationHistory, type ConversationHistoryHit } from "./conversation-history-search.service";
import type { CompanyQueryEntitySet, CompanyQueryPlan } from "./company-query-plan.types";

export type CompanyQueryCustomerMatch = Readonly<{
  customerId: string;
  customerName: string;
  receivableOutstanding: Readonly<{ currency: string; amount: number }>[] | null;
}>;

export type CompanyQueryResult =
  | Readonly<{
      scope: "customer_set";
      dateRangeLabel: string | null;
      setPipelineDescription: readonly string[];
      matches: readonly CompanyQueryCustomerMatch[];
    }>
  | Readonly<{
      scope: "single_customer";
      customer: ResolvableCustomer;
      dateRangeLabel: string | null;
      quoteHistory: readonly CustomerQuoteRow[] | null;
      orderHistory: readonly CustomerOrderRow[] | null;
      receivable: readonly Readonly<{ currency: string; totalOutstanding: number; overdueOutstanding: number }>[] | null;
      // undefined = COMMERCIAL_TERMS wasn't requested; null = requested but no
      // terms are on file for this customer; object = requested and found.
      commercialTerms: CustomerCommercialTerms | null | undefined;
      conversationHistory: readonly ConversationHistoryHit[] | null;
    }>
  | Readonly<{ scope: "customer_not_found"; reference: string }>
  | Readonly<{ scope: "customer_ambiguous"; reference: string; candidates: readonly ResolvableCustomer[] }>;

const SET_LABELS: Record<CompanyQueryEntitySet, string> = {
  CUSTOMERS_WITH_QUOTE_SENT: "bu dönemde teklif gönderilen müşteriler",
  CUSTOMERS_WITH_CONFIRMED_ORDER: "bu dönemde onaylı siparişi olan müşteriler",
  CUSTOMERS_WITH_RECEIVABLE_BALANCE: "güncel açık alacak bakiyesi olan müşteriler",
};

async function resolveEntitySetMembers(
  set: CompanyQueryEntitySet,
  organizationId: string,
  window: Readonly<{ start: Date; end: Date }>,
): Promise<Map<string, { customerName: string; receivable?: { currency: string; amount: number }[] }>> {
  if (set === "CUSTOMERS_WITH_QUOTE_SENT") {
    const rows = await readQuotesSentInRange(organizationId, window);
    const map = new Map<string, { customerName: string }>();
    for (const row of rows) if (!map.has(row.customerId)) map.set(row.customerId, { customerName: row.customerName });
    return map;
  }
  if (set === "CUSTOMERS_WITH_CONFIRMED_ORDER") {
    const rows = await readConfirmedOrdersInRange(organizationId, window);
    const map = new Map<string, { customerName: string }>();
    for (const row of rows) if (!map.has(row.customerId)) map.set(row.customerId, { customerName: "" });
    return map;
  }
  // CUSTOMERS_WITH_RECEIVABLE_BALANCE — a current-state stock fact, deliberately
  // NOT scoped to `window` (a flow-scoped date range); membership means "has a
  // positive outstanding balance right now", independent of when the pipeline's
  // other steps are scoped to. See the type's own comment for why mixing a
  // stock-membership check into a flow-scoped pipeline is intentional, not a
  // stock/flow conflation — the response text keeps the two labeled distinctly.
  const dataset = await buildCurrentReceivableDataset(organizationId, {});
  const map = new Map<string, { customerName: string; receivable: { currency: string; amount: number }[] }>();
  for (const currency of dataset.currencies) {
    for (const customer of currency.customers) {
      if (!customer.customerId || customer.totalOutstanding <= 0) continue;
      const existing = map.get(customer.customerId);
      const entry = { currency: currency.currency, amount: customer.totalOutstanding };
      if (existing) existing.receivable.push(entry);
      else map.set(customer.customerId, { customerName: customer.customerName, receivable: [entry] });
    }
  }
  return map;
}

async function resolveCustomerSet(
  organizationId: string,
  plan: Extract<CompanyQueryPlan, { scope: "customer_set" }>,
  now: Date,
  timeZone: string,
): Promise<CompanyQueryResult> {
  const window = plan.dateRange
    ? resolveCompanyQueryDateRange(plan.dateRange, now, timeZone)
    : resolveCompanyQueryDateRange({ kind: "LAST_N_DAYS", days: 90 }, now, timeZone);

  const distinctSets = [...new Set(plan.setPipeline.map((step) => step.set))];
  const resolvedSets = new Map<CompanyQueryEntitySet, Map<string, { customerName: string; receivable?: { currency: string; amount: number }[] }>>();
  await Promise.all(distinctSets.map(async (set) => {
    resolvedSets.set(set, await resolveEntitySetMembers(set, organizationId, { start: window.start, end: window.end }));
  }));

  let current: Set<string> = new Set();
  let initialized = false;
  for (const step of plan.setPipeline) {
    const members = new Set(resolvedSets.get(step.set)!.keys());
    if (step.op === "BASE" || !initialized) {
      current = members;
      initialized = true;
    } else if (step.op === "INTERSECT") {
      current = new Set([...current].filter((id) => members.has(id)));
    } else {
      current = new Set([...current].filter((id) => !members.has(id)));
    }
  }
  const finalIds = current;

  // Prefer a name from any resolved set that actually carries one (receivable
  // and quote-sent sets do; confirmed-order membership alone doesn't).
  const nameFor = (customerId: string): string => {
    for (const map of resolvedSets.values()) {
      const entry = map.get(customerId);
      if (entry?.customerName) return entry.customerName;
    }
    return "Müşterisi belirtilmemiş";
  };
  const receivableFor = (customerId: string) => resolvedSets.get("CUSTOMERS_WITH_RECEIVABLE_BALANCE")?.get(customerId)?.receivable ?? null;

  const matches: CompanyQueryCustomerMatch[] = [...finalIds]
    .map((customerId) => Object.freeze({ customerId, customerName: nameFor(customerId), receivableOutstanding: receivableFor(customerId) }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "tr"));

  return Object.freeze({
    scope: "customer_set",
    dateRangeLabel: window.label,
    setPipelineDescription: plan.setPipeline.map((step) => `${step.op}(${SET_LABELS[step.set]})`),
    matches: Object.freeze(matches),
  });
}

async function resolveSingleCustomer(
  organizationId: string,
  plan: Extract<CompanyQueryPlan, { scope: "single_customer" }>,
  now: Date,
  timeZone: string,
  conversationId: string,
): Promise<CompanyQueryResult> {
  const customers = await listActiveCustomers(organizationId);
  const resolution = resolveCustomerReference(customers, plan.customerReference);
  if (resolution.status === "NOT_FOUND") return Object.freeze({ scope: "customer_not_found", reference: plan.customerReference });
  if (resolution.status === "AMBIGUOUS") return Object.freeze({ scope: "customer_ambiguous", reference: plan.customerReference, candidates: Object.freeze(resolution.options) });

  const customer = resolution.customer;
  const window = plan.dateRange ? resolveCompanyQueryDateRange(plan.dateRange, now, timeZone) : null;

  const wantsQuotes = plan.facts.includes("QUOTE_HISTORY");
  const wantsOrders = plan.facts.includes("ORDER_HISTORY");
  const wantsReceivable = plan.facts.includes("RECEIVABLE_POSITION");
  const wantsTerms = plan.facts.includes("COMMERCIAL_TERMS");
  const wantsConversations = plan.facts.includes("CONVERSATION_HISTORY");

  const [quoteHistory, orderHistory, receivableDataset, commercialTerms, conversationHistory] = await Promise.all([
    wantsQuotes ? readQuotesForCustomer(organizationId, customer.id, window) : Promise.resolve(null),
    wantsOrders ? readConfirmedOrdersForCustomer(organizationId, customer.id, window) : Promise.resolve(null),
    wantsReceivable ? buildCurrentReceivableDataset(organizationId, {}) : Promise.resolve(null),
    wantsTerms ? readCommercialTermsForCustomer(organizationId, customer.id) : Promise.resolve(undefined),
    wantsConversations
      ? searchConversationHistory(organizationId, {
          excludeConversationId: conversationId,
          keywords: [customer.displayName, ...(plan.conversationTopicKeywords ?? [])],
        })
      : Promise.resolve(null),
  ]);

  const receivable = receivableDataset
    ? receivableDataset.currencies.flatMap((currency) => {
        const row = currency.customers.find((c) => c.customerId === customer.id);
        return row
          ? [Object.freeze({ currency: currency.currency, totalOutstanding: row.totalOutstanding, overdueOutstanding: row.overdueOutstanding })]
          : [];
      })
    : null;

  return Object.freeze({
    scope: "single_customer",
    customer,
    dateRangeLabel: window?.label ?? null,
    quoteHistory,
    orderHistory,
    receivable,
    commercialTerms,
    conversationHistory,
  });
}

export async function executeCompanyQueryPlan(
  organizationId: string,
  plan: CompanyQueryPlan,
  ctx: Readonly<{ now: Date; timeZone: string; conversationId: string }>,
): Promise<CompanyQueryResult> {
  return plan.scope === "customer_set"
    ? resolveCustomerSet(organizationId, plan, ctx.now, ctx.timeZone)
    : resolveSingleCustomer(organizationId, plan, ctx.now, ctx.timeZone, ctx.conversationId);
}
