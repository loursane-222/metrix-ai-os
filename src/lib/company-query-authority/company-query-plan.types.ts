// Closed-vocabulary compositional query plan. This is the upper bound the
// brief asked for: instead of a phrase-specific managementIntent for every
// new combination of already-existing canonical facts, the classifier picks
// from a small, closed set of ENTITY SETS and composes them with a small,
// closed set of SET OPERATIONS (BASE/INTERSECT/EXCEPT). Any future
// combination of these primitives works without new code — only a
// genuinely new underlying fact source requires a code change (a new set
// name/fact name), never a new combination of existing ones.
//
// Execution is entirely deterministic (see company-query-authority.service.ts):
// the model never sees or writes Prisma/SQL, and never does arithmetic over
// raw rows — it only selects which already-computed facts to pull and how to
// combine them.

export const COMPANY_QUERY_ENTITY_SETS = [
  // Customers with >=1 quote whose sentAt falls inside the resolved date range.
  "CUSTOMERS_WITH_QUOTE_SENT",
  // Customers with >=1 order whose confirmedAt (canonical confirmed-order
  // truth) falls inside the resolved date range.
  "CUSTOMERS_WITH_CONFIRMED_ORDER",
  // Customers with a positive outstanding receivable balance right now
  // (current-state fact, not scoped to the date range — receivable balance
  // is a stock, not a flow; mixing it with a flow-scoped set is intentional
  // and exactly what INTERSECT/EXCEPT composition is for).
  "CUSTOMERS_WITH_RECEIVABLE_BALANCE",
] as const;
export type CompanyQueryEntitySet = (typeof COMPANY_QUERY_ENTITY_SETS)[number];

export const COMPANY_QUERY_SET_OPS = ["BASE", "INTERSECT", "EXCEPT"] as const;
export type CompanyQuerySetOp = (typeof COMPANY_QUERY_SET_OPS)[number];

export type CompanyQuerySetStep = Readonly<{
  set: CompanyQueryEntitySet;
  // The first step of a pipeline must be "BASE" (the starting set); every
  // step after that narrows it with INTERSECT or removes members with EXCEPT.
  op: CompanyQuerySetOp;
}>;

// The model only ever supplies a small positive integer for LAST_N_DAYS
// ("last 3 months" -> days: 90) — it never computes an absolute date range
// itself. Resolution is always deterministic, server-side, from the real
// clock (see resolveCompanyQueryDateRange), same discipline already used for
// calendar dates elsewhere in this codebase.
export const COMPANY_QUERY_DATE_RANGE_KINDS = ["CURRENT_MONTH", "PREVIOUS_MONTH", "LAST_N_DAYS"] as const;
export type CompanyQueryDateRange =
  | Readonly<{ kind: "CURRENT_MONTH" }>
  | Readonly<{ kind: "PREVIOUS_MONTH" }>
  | Readonly<{ kind: "LAST_N_DAYS"; days: number }>;

export const COMPANY_QUERY_CUSTOMER_FACTS = [
  "QUOTE_HISTORY",
  "ORDER_HISTORY",
  "RECEIVABLE_POSITION",
  "COMMERCIAL_TERMS",
  "CONVERSATION_HISTORY",
] as const;
export type CompanyQueryCustomerFact = (typeof COMPANY_QUERY_CUSTOMER_FACTS)[number];

export type CompanyQueryPlan =
  | Readonly<{
      scope: "customer_set";
      // First element's op must be "BASE". 1-4 steps.
      setPipeline: readonly CompanyQuerySetStep[];
      dateRange: CompanyQueryDateRange | null;
      // true: the deterministic fact answer is handed to a short, separate,
      // clearly-labeled GM judgment pass (see company-query-judgment.service.ts)
      // before being returned. false: the fact answer is returned as-is.
      judgmentNeed: boolean;
    }>
  | Readonly<{
      scope: "single_customer";
      // Free-text reference the user used for the customer, resolved
      // deterministically via the existing resolveCustomerReference (same
      // resolver businessNavigation already uses) — never a fabricated id.
      customerReference: string;
      // 1-5 facts.
      facts: readonly CompanyQueryCustomerFact[];
      dateRange: CompanyQueryDateRange | null;
      // Only read when "CONVERSATION_HISTORY" is in facts. Extra topic words
      // beyond the customer's own name (e.g. "ödeme planı") to narrow the
      // keyword search; null/empty means search by customer name alone.
      conversationTopicKeywords: readonly string[] | null;
      judgmentNeed: boolean;
    }>;
