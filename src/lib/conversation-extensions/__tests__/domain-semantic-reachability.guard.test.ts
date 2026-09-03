import { describe, expect, it } from "vitest";
import { actionRegistry } from "@/lib/action-runtime/registry";
import { CONVERSATION_EXTENSION_DOMAINS } from "../conversation-extension-handoff";

/**
 * Structural, self-updating proof of the operation's central invariant:
 *
 *   "Bir extension'ın dizi sırası, regex'i veya domain-specific planner'ı
 *   artık METRIX'in bir capability'ye ulaşıp ulaşamayacağını belirleyememeli.
 *   Capability reachability canonical registry + typed semantic authority
 *   tarafından belirlenmelidir."
 *
 * This test does NOT hand-verify one domain at a time (the brief explicitly
 * rejects "representative domain testing" as sufficient proof) — it walks
 * every domain in the canonical ConversationExtensionDomain inventory
 * (conversation-extension-handoff.ts, the closed vocabulary every
 * conversation extension's handoff.domain is drawn from) and checks it
 * against the REAL, live actionRegistry (@/lib/action-runtime/registry —
 * the same singleton production-execution-runtime.ts wires handlers into),
 * not a hand-typed snapshot of action names. Adding a new domain to
 * CONVERSATION_EXTENSION_DOMAINS, or a new action to the registry, changes
 * what this test sees on its very next run — no test edit required to stay
 * accurate, only required to stay GREEN (either register the domain's
 * actions, or add a justified, reviewed entry to
 * DOMAINS_WITHOUT_MUTATION_CAPABILITY below).
 *
 * What "reachable" means here: at least one DOMAIN-class action in
 * actionRegistry whose dotted actionName's first segment is one of the
 * domain's registered prefixes. This is deliberately the same test Faz 1's
 * investigation used by hand ("actionRegistry'de X prefix'i var mı") —
 * this file makes that check permanent and automatic instead of a one-time
 * manual audit, which is the whole point of a structural coverage guard.
 */

// Domain → the actionRegistry actionName prefix(es) that back it. A domain
// legitimately maps to more than one prefix (e.g. "stocks" covers both
// stock movements and the warehouses they move between; "production"
// covers production orders plus the work centers/machines that run them).
const DOMAIN_ACTION_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  customers: ["customer"],
  tasks: ["task"],
  calendar: ["calendar_event"],
  quotes: ["quote"],
  payments: ["payment"],
  invoices: ["invoice"],
  suppliers: ["supplier"],
  orders: ["order"],
  deliveries: ["delivery"],
  stocks: ["stock", "warehouse"],
  products: ["product"],
  team: ["organization_member"],
  goals: ["goal"],
  company: ["company"],
  production: ["production", "machine", "workCenter"],
};

// Domains genuinely exempt from "must have a registered mutation action" —
// each entry is a reviewed, justified exception (per the operation's hard
// constraint #1: a per-domain carve-out is only legitimate when the shared
// contract cannot express it, and must be justified here / in the final
// report, not silently special-cased).
const DOMAINS_WITHOUT_MUTATION_CAPABILITY: Readonly<Record<string, string>> = {
  // Pure navigation — opens a read-only summary/dashboard screen
  // (accounting-management-/finance-management-conversation-extension.ts).
  // No entity is created/changed; there is nothing for the Action Runtime
  // to own.
  accounting: "Navigate-only domain (opens a summary screen); no mutation to register.",
  finance: "Navigate-only domain (opens a summary screen); no mutation to register.",
  // Mostly navigation/notification/lookup. One real exception is known and
  // deliberately NOT closed in this operation: payment-reminder-
  // conversation-extension.ts's WhatsApp statement-link flow performs a
  // real mutation (POST /api/customers/[id]/statement-public-link,
  // mutationPerformed: true) directly against an HTTP route, with no
  // Action Runtime manifest behind it. It was discovered during this
  // operation's Faz-4 pass but was out of the scope Murat asked to prove
  // (Team/Goal/Calendar) and is a differently-shaped capability (an
  // outbound-share/notification action, not a domain CRUD action) — flagged
  // here and in the final report as a known follow-up, not silently
  // dropped.
  communications: "Mostly navigation/notification; one known real gap (statement-link share) flagged for follow-up, not closed in this operation — see comment above.",
  // The generic orchestration fallback's own bucket for its per-step
  // results (see orchestration-conversation-extension.ts) — a meta-domain,
  // not a real business domain with its own actions. Its whole purpose is
  // to report evidence for actions that live under OTHER domains' prefixes.
  orchestrations: "Meta-domain for the generic orchestration fallback's own evidence; not a business domain with its own actions.",
};

describe("domain semantic reachability — structural coverage guard", () => {
  const allActionNames = actionRegistry.listAllActions().map((definition) => definition.actionName);
  const prefixesInRegistry = new Set(allActionNames.map((name) => name.split(".")[0]!));

  it("accounts for every domain in the canonical ConversationExtensionDomain inventory — no domain silently unclassified", () => {
    const classified = new Set([...Object.keys(DOMAIN_ACTION_PREFIXES), ...Object.keys(DOMAINS_WITHOUT_MUTATION_CAPABILITY)]);
    const unclassified = CONVERSATION_EXTENSION_DOMAINS.filter((domain) => !classified.has(domain));
    expect(unclassified, "Every ConversationExtensionDomain must be either mapped to real actionRegistry prefixes or listed as a justified exemption above.").toEqual([]);
  });

  it("never lists a mapping/exemption key that is not a real ConversationExtensionDomain (catches typos the other direction)", () => {
    const realDomains = new Set<string>(CONVERSATION_EXTENSION_DOMAINS);
    const bogusKeys = [...Object.keys(DOMAIN_ACTION_PREFIXES), ...Object.keys(DOMAINS_WITHOUT_MUTATION_CAPABILITY)].filter((key) => !realDomains.has(key));
    expect(bogusKeys).toEqual([]);
  });

  it("never double-classifies a domain as both registry-backed and exempt", () => {
    const overlap = Object.keys(DOMAIN_ACTION_PREFIXES).filter((domain) => domain in DOMAINS_WITHOUT_MUTATION_CAPABILITY);
    expect(overlap).toEqual([]);
  });

  it.each(Object.entries(DOMAIN_ACTION_PREFIXES))(
    "domain '%s' has at least one real, registered DOMAIN-class action (not a legacy-only capability)",
    (domain, prefixes) => {
      const matches = allActionNames.filter((name) => prefixes.includes(name.split(".")[0]!));
      expect(matches.length, `Expected at least one action-runtime action for domain "${domain}" under prefix(es) ${prefixes.join("/")}. Found none among: ${allActionNames.join(", ")}`).toBeGreaterThan(0);
    },
  );

  it("every declared domain prefix is a prefix some real action in the registry actually uses (catches stale/typo'd mappings above)", () => {
    const declaredPrefixes = Object.values(DOMAIN_ACTION_PREFIXES).flat();
    const stale = declaredPrefixes.filter((prefix) => !prefixesInRegistry.has(prefix));
    expect(stale, "A prefix listed in DOMAIN_ACTION_PREFIXES no longer matches any real registered action — the mapping is stale.").toEqual([]);
  });

  it("CONVERSATION_EXTENSION_DOMAINS itself has not silently shrunk (guards the guard: a deleted domain constant would make every check above vacuously pass)", () => {
    expect(CONVERSATION_EXTENSION_DOMAINS.length).toBeGreaterThanOrEqual(19);
  });
});

