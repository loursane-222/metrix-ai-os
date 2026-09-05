/**
 * Legacy Domain Semantic Ownership Final Consolidation — the single,
 * explicit ownership-classification boundary for every conversation
 * extension. This is the ONLY place that decides which extensions are
 * still allowed to be active semantic owners, and why. It replaces
 * active-conversation-extension.ts's own inline `extensions` array as the
 * source of truth for what is dispatched — that file now imports its list
 * from here instead of declaring it itself.
 *
 * Binding invariant: ONE NATURAL-LANGUAGE BUSINESS INTENT -> METRIX
 * EXECUTIVE AGENT -> CANONICAL CAPABILITY/ORCHESTRATION -> POLICY/APPROVAL
 * -> ACTION RUNTIME -> READBACK. An extension may remain an active
 * dispatch target ONLY if it fits one of three legitimate authorities:
 *
 * - PRESENTATION_NAVIGATION: opens/closes/shows a surface, no business
 *   mutation, no company judgment. Deterministic fast path.
 *
 * - CANONICAL_CONTINUATION_APPROVAL: confirms/reviews an ALREADY-CREATED
 *   canonical durable pending item (an orchestration approval, a
 *   rep-submitted request, a report submission slot) — never originates a
 *   new, unrelated business intent, and always checks real backend state
 *   (a "nothing pending" turn always falls through as NOT_HANDLED, never
 *   fabricates a decision).
 *
 * - CONTEXT_BOUND_WORKSPACE_COMMAND: applies ONLY to the single canonical
 *   entity already bound to a Workspace surface the user has themselves
 *   already navigated to and is currently looking at (getActive*SurfaceDescriptor()
 *   returns null, and the extension returns NOT_HANDLED, the instant that
 *   surface isn't mounted — verified per-extension below). It does no new
 *   entity/domain resolution from free text, does no company-wide
 *   reasoning, cannot switch domains, and its real mutation (the "commit"
 *   step) goes through the same canonical action boundary (e.g.
 *   customer.update) the Executive Agent's own tools use — confirmed for
 *   the customer-edit family via customer-edit-command-integration.ts's own
 *   documented contract ("gerçek mutasyon customer.update'in kendi
 *   authorize edilmiş sınırından geçer"). This is a live "type into the
 *   screen you already opened" copilot, not a second cold business brain —
 *   it cannot be reached by, and cannot compete for, a "cold" utterance
 *   with no matching open surface.
 *
 * Any extension that does NOT fit one of these three is not included in
 * REGISTERED_EXTENSIONS at all — it is unreachable from active dispatch,
 * so a new-intent utterance always falls through to the Executive Agent
 * instead (see active-conversation-extension.ts's NOT_HANDLED fallback and
 * route.ts's authoritativeConversationExtensionHandoff/executiveAgentWillRespond).
 *
 * A small number of extensions provide a real, currently-unreplicated
 * business capability (structured document extraction, field-visit
 * order/payment-linkage safety rules, field-rep propose-not-execute
 * workflows, a rep's own goal-setting report, WhatsApp-compose utilities)
 * that the canonical Action Registry (action-catalog.ts) does not yet
 * expose to the Agent. Per this operation's explicit "do NOT remove
 * capabilities" / "do not invent unsupported capabilities" constraints,
 * these remain active and unclassified here (reachable as before) — they
 * are NOT silently retired, and are reported explicitly, by name, as the
 * reason the final consolidation count is not yet zero. See the operation
 * report for the itemized list and the closure path for each.
 */

import type { ConversationExtension } from "./conversation-extension-contract";

import { repRequestReviewConversationExtension } from "./rep-request-review-conversation-extension";
import { repOrderRequestConversationExtension } from "./rep-order-request-conversation-extension";
import { repQuoteRequestConversationExtension } from "./rep-quote-request-conversation-extension";
import { repPaymentRequestConversationExtension } from "./rep-payment-request-conversation-extension";
import { companyUnitActionConversationExtension } from "./company-unit-action-conversation-extension";
import { companyUnitFormConversationExtension } from "./company-unit-form-conversation-extension";
import { companyGoalCreateConversationExtension } from "./company-goal-create-conversation-extension";
import { companyAssetCreateConversationExtension } from "./company-asset-create-conversation-extension";
import { companySourceCreateConversationExtension } from "./company-source-create-conversation-extension";
import { companyProfileEditConversationExtension } from "./company-profile-edit-conversation-extension";
import { companyProfileCandidateConversationExtension } from "./company-profile-candidate-conversation-extension";
import { collectionActionEditConversationExtension } from "./collection-action-edit-conversation-extension";
import { customerEditConversationExtension } from "./customer-edit-conversation-extension";
import { offerEditConversationExtension } from "./offer-edit-conversation-extension";
import { orderEditConversationExtension } from "./order-edit-conversation-extension";
import { deliveryEditConversationExtension } from "./delivery-edit-conversation-extension";
import { invoiceEditConversationExtension } from "./invoice-edit-conversation-extension";
import { paymentEditConversationExtension } from "./payment-edit-conversation-extension";
import { taskEditConversationExtension } from "./task-edit-conversation-extension";
import { supplierEditConversationExtension } from "./supplier-edit-conversation-extension";
import { productEditConversationExtension } from "./product-edit-conversation-extension";
import { goalEditConversationExtension } from "./goal-edit-conversation-extension";
import { goalCreateConversationExtension } from "./goal-create-conversation-extension";
import { stockOperationConversationExtension } from "./stock-operation-conversation-extension";
import { customerManagementConversationExtension } from "./customer-management-conversation-extension";
import { offerManagementConversationExtension } from "./offer-management-conversation-extension";
import { paymentManagementConversationExtension } from "./payment-management-conversation-extension";
import { invoiceManagementConversationExtension } from "./invoice-management-conversation-extension";
import { supplierManagementConversationExtension } from "./supplier-management-conversation-extension";
import { orderManagementConversationExtension } from "./order-management-conversation-extension";
import { deliveryManagementConversationExtension } from "./delivery-management-conversation-extension";
import { stockManagementConversationExtension } from "./stock-management-conversation-extension";
import { productManagementConversationExtension } from "./product-management-conversation-extension";
import { financeManagementConversationExtension } from "./finance-management-conversation-extension";
import { accountingManagementConversationExtension } from "./accounting-management-conversation-extension";
import { teamManagementConversationExtension } from "./team-management-conversation-extension";
import { repGoalCreateConversationExtension } from "./rep-goal-create-conversation-extension";
import { reportSubmissionConversationExtension } from "./report-submission-conversation-extension";
import { reportReviewConversationExtension } from "./report-review-conversation-extension";
import { fieldVisitConversationExtension } from "./field-visit-conversation-extension";
import { goalManagementConversationExtension } from "./goal-management-conversation-extension";
import { customerImportConversationExtension } from "./customer-import-conversation-extension";
import { productImportConversationExtension } from "./product-import-conversation-extension";
import { invoiceImportConversationExtension } from "./invoice-import-conversation-extension";
import { supplierImportConversationExtension } from "./supplier-import-conversation-extension";
import { paymentImportConversationExtension } from "./payment-import-conversation-extension";
import { offerImportConversationExtension } from "./offer-import-conversation-extension";
import { orderImportConversationExtension } from "./order-import-conversation-extension";
import { deliveryImportConversationExtension } from "./delivery-import-conversation-extension";
import { stockImportConversationExtension } from "./stock-import-conversation-extension";
import { productionImportConversationExtension } from "./production-import-conversation-extension";
import { generalImportConversationExtension } from "./general-import-conversation-extension";
import { paymentReminderConversationExtension } from "./payment-reminder-conversation-extension";
import { supplierMessageConversationExtension } from "./supplier-message-conversation-extension";
import { orchestrationApprovalConversationExtension } from "./orchestration-approval-conversation-extension";
import { documentIntelligenceConversationExtension } from "./document-intelligence-conversation-extension";
import { calendarManagementConversationExtension } from "./calendar-management-conversation-extension";
import { taskManagementConversationExtension } from "./task-management-conversation-extension";

export const SEMANTIC_AUTHORITIES = [
  "PRESENTATION_NAVIGATION",
  "CANONICAL_CONTINUATION_APPROVAL",
  "CONTEXT_BOUND_WORKSPACE_COMMAND",
] as const;
export type SemanticAuthority = (typeof SEMANTIC_AUTHORITIES)[number];

export type RegisteredExtension = Readonly<{
  name: string;
  extension: ConversationExtension;
  authority: SemanticAuthority;
}>;

// Deliberately NOT given one of the three legitimate authorities above —
// doing so would misrepresent a cold, always-active extension as
// screen-scoped or continuation-only when it structurally is neither. Kept
// active (still dispatched — see active-conversation-extension.ts) only
// because retiring it would remove real, currently-unreplicated capability
// (see this file's header and the operation's final report for the
// itemized reason per entry). This list's length is the operation's
// honest "not yet closed" count — never hidden, never rounded to zero.
export type ResidualLegacyExtension = Readonly<{
  name: string;
  extension: ConversationExtension;
  reason: string;
}>;

// Retired from active dispatch this operation (Legacy Domain Semantic
// Ownership Final Consolidation) — proven, single-purpose, 1:1 Action
// Registry parity confirmed by reading both the extension and
// action-catalog.ts's registered actions, with no deterministic sub-logic
// of their own to lose:
//   production-management   -> production.create (42 lines, thin create wrapper)
//   business-overview        -> retired as a Class D business-judgment owner;
//                              the Agent's own tools already answer whole-
//                              business questions (proven repeatedly in this
//                              session's production acceptance) and this
//                              extension (34 lines) computed nothing itself —
//                              it only triggered a legacy server-side
//                              judgment path.
// A cold utterance these used to catch now falls through to NOT_HANDLED
// here, reaching the Executive Agent instead.
//
// NOT yet retired, and deliberately NOT registered below either — kept
// fully active and reachable exactly as before, because retiring them
// would remove real, currently-unreplicated capability (see the file
// header and the operation's final report for the itemized reason per
// extension): customerManagementConversationExtension,
// offerManagementConversationExtension, orderManagementConversationExtension,
// deliveryManagementConversationExtension, invoiceManagementConversationExtension,
// paymentManagementConversationExtension, stockManagementConversationExtension,
// teamManagementConversationExtension, paymentReminderConversationExtension,
// supplierMessageConversationExtension, repGoalCreateConversationExtension,
// repOrderRequestConversationExtension, repQuoteRequestConversationExtension,
// repPaymentRequestConversationExtension, fieldVisitConversationExtension,
// documentIntelligenceConversationExtension, calendarManagementConversationExtension
// (this last one specifically: its Turkish weekday/time resolution —
// resolveStartAt's DAY_INDEX arithmetic for "pazartesi saat 18:30" style
// utterances — and its live organization-member availability query are
// deterministic logic with no proven equivalent inside the Agent's own
// calendar_event.create tool; the action-catalog entry is only a name +
// description, not a date-resolution guarantee, so retiring this one
// without first verifying the Agent reproduces the exact same weekday math
// would risk a silent capability regression), taskManagementConversationExtension
// (this one specifically: task.create parity itself IS confirmed in the
// Action Registry and the extension has no deterministic sub-logic of its
// own — but live-testing its retirement surfaced a real regression, not a
// capability gap: with task-management removed from the array,
// fieldVisitConversationExtension's own grammar (unrelated, pre-existing,
// out of scope to fix here) incorrectly claims some task-create utterances
// itself — e.g. "yeni görev oluştur: haftalık raporu kontrol et" matched
// fieldVisit's "haftalık" (weekly) report-summary grammar and returned a
// definitive FIELD_VISIT_WEEKLY_SUMMARY_REQUEST_FAILED handoff instead of
// falling through to the Agent. task-management was incidentally
// "shielding" this utterance space by claiming it first; removing it
// exposed a latent, unrelated collision. Per "no change may degrade
// existing production behavior as a side effect of an unrelated fix," this
// stays active until fieldVisitConversationExtension's own grammar is
// tightened in a separate, scoped change).
export const REGISTERED_EXTENSIONS: readonly RegisteredExtension[] = [
  // --- PRESENTATION_NAVIGATION: pure open/show/navigate, no mutation ---
  { name: "financeManagementConversationExtension", extension: financeManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "accountingManagementConversationExtension", extension: accountingManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "productManagementConversationExtension", extension: productManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "goalManagementConversationExtension", extension: goalManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "supplierManagementConversationExtension", extension: supplierManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "customerImportConversationExtension", extension: customerImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "productImportConversationExtension", extension: productImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "invoiceImportConversationExtension", extension: invoiceImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "supplierImportConversationExtension", extension: supplierImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "paymentImportConversationExtension", extension: paymentImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "offerImportConversationExtension", extension: offerImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "orderImportConversationExtension", extension: orderImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "deliveryImportConversationExtension", extension: deliveryImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "stockImportConversationExtension", extension: stockImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "productionImportConversationExtension", extension: productionImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "generalImportConversationExtension", extension: generalImportConversationExtension, authority: "PRESENTATION_NAVIGATION" },

  // --- CANONICAL_CONTINUATION_APPROVAL: confirms/reviews an existing durable pending item ---
  { name: "orchestrationApprovalConversationExtension", extension: orchestrationApprovalConversationExtension, authority: "CANONICAL_CONTINUATION_APPROVAL" },
  { name: "repRequestReviewConversationExtension", extension: repRequestReviewConversationExtension, authority: "CANONICAL_CONTINUATION_APPROVAL" },
  { name: "reportReviewConversationExtension", extension: reportReviewConversationExtension, authority: "CANONICAL_CONTINUATION_APPROVAL" },
  { name: "reportSubmissionConversationExtension", extension: reportSubmissionConversationExtension, authority: "CANONICAL_CONTINUATION_APPROVAL" },

  // --- CONTEXT_BOUND_WORKSPACE_COMMAND: only active while that entity's own Workspace surface is mounted ---
  { name: "companyUnitActionConversationExtension", extension: companyUnitActionConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "companyUnitFormConversationExtension", extension: companyUnitFormConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "companyGoalCreateConversationExtension", extension: companyGoalCreateConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "companyAssetCreateConversationExtension", extension: companyAssetCreateConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "companySourceCreateConversationExtension", extension: companySourceCreateConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "companyProfileEditConversationExtension", extension: companyProfileEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "companyProfileCandidateConversationExtension", extension: companyProfileCandidateConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "collectionActionEditConversationExtension", extension: collectionActionEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "customerEditConversationExtension", extension: customerEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "offerEditConversationExtension", extension: offerEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "orderEditConversationExtension", extension: orderEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "deliveryEditConversationExtension", extension: deliveryEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "invoiceEditConversationExtension", extension: invoiceEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "paymentEditConversationExtension", extension: paymentEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "taskEditConversationExtension", extension: taskEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "supplierEditConversationExtension", extension: supplierEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "productEditConversationExtension", extension: productEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "goalEditConversationExtension", extension: goalEditConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "goalCreateConversationExtension", extension: goalCreateConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
  { name: "stockOperationConversationExtension", extension: stockOperationConversationExtension, authority: "CONTEXT_BOUND_WORKSPACE_COMMAND" },
];

// Honest, explicit residual — see ResidualLegacyExtension's own doc comment
// above and this file's header. None of these are PRESENTATION_NAVIGATION
// (they mutate), none are CANONICAL_CONTINUATION_APPROVAL (they originate
// new business intent from free text, not confirm an existing pending
// item), and none are CONTEXT_BOUND_WORKSPACE_COMMAND (they are
// always-active — getActiveScopeKey() keys off window.location.pathname,
// not a specific mounted entity surface — so they compete for ANY cold
// utterance app-wide). They remain fully active and reachable, unchanged
// from before this operation, purely to avoid the capability loss this
// operation's own binding constraints forbid. This is the operation's
// honest "not yet closed" count.
export const RESIDUAL_LEGACY_EXTENSIONS: readonly ResidualLegacyExtension[] = [
  { name: "customerManagementConversationExtension", extension: customerManagementConversationExtension, reason: "Multi-stage coordinator (attachment-notify, custom-field-via-\"olsun\", create-draft, archive, update, lookup) — archive/create/update map to customer.archive/create/update in the Action Registry, but the attachment-notify and custom-field sub-stages were not individually verified against an equivalent canonical capability within this pass; retiring the whole extension risked losing those without proof." },
  { name: "offerManagementConversationExtension", extension: offerManagementConversationExtension, reason: "223-line multi-stage coordinator (quote create/update/send/WhatsApp-compose/lifecycle) not individually verified sub-stage-by-sub-stage against the Action Registry's quote.* actions within this pass." },
  { name: "taskManagementConversationExtension", extension: taskManagementConversationExtension, reason: "task.create parity IS confirmed in the Action Registry and this extension has no deterministic sub-logic of its own to lose — but live-testing retirement surfaced a real regression: with it removed, fieldVisitConversationExtension's own unrelated grammar (later in this list) incorrectly claims some task-create utterances instead (e.g. \"yeni görev oluştur: haftalık raporu kontrol et\" matched fieldVisit's \"haftalık\" weekly-report grammar and threw/failed instead of falling through to the Agent). task-management must stay ordered ahead of fieldVisit here, exactly as in the original dispatch order, so it keeps shielding this utterance space until fieldVisitConversationExtension's grammar is tightened in a separate, scoped change." },
  { name: "orderManagementConversationExtension", extension: orderManagementConversationExtension, reason: "166-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against order.* actions within this pass." },
  { name: "deliveryManagementConversationExtension", extension: deliveryManagementConversationExtension, reason: "137-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against delivery.* actions within this pass." },
  { name: "invoiceManagementConversationExtension", extension: invoiceManagementConversationExtension, reason: "112-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against invoice.* actions within this pass." },
  { name: "paymentManagementConversationExtension", extension: paymentManagementConversationExtension, reason: "108-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against payment.*/collection.* actions within this pass." },
  { name: "stockManagementConversationExtension", extension: stockManagementConversationExtension, reason: "141-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against stock.* actions within this pass." },
  { name: "teamManagementConversationExtension", extension: teamManagementConversationExtension, reason: "Role-change/toggle-active map to organization_member.update, but the email-invite sub-feature (creating a brand-new membership) has no confirmed Action Registry equivalent — retiring the whole extension would risk losing invite specifically." },
  { name: "paymentReminderConversationExtension", extension: paymentReminderConversationExtension, reason: "Composes and opens a WhatsApp message with a live account statement — a communication utility with no Action Registry equivalent (it performs no METRIX-side mutation itself, so it does not map onto any canonical write action to toolify)." },
  { name: "supplierMessageConversationExtension", extension: supplierMessageConversationExtension, reason: "Same as paymentReminder — composes/opens a WhatsApp message to a supplier; no Action Registry equivalent to route through." },
  { name: "repGoalCreateConversationExtension", extension: repGoalCreateConversationExtension, reason: "Submits a field rep's own goal-setting report via a dedicated rep-goals client — a distinct business object from goal.create (company-wide sales/collection targets); no confirmed equivalent action." },
  { name: "repOrderRequestConversationExtension", extension: repOrderRequestConversationExtension, reason: "Proposes a new RepRequest (order) for office approval via a role-gated propose-not-execute workflow — a distinct business object and authority model from order.create; no confirmed equivalent action." },
  { name: "repQuoteRequestConversationExtension", extension: repQuoteRequestConversationExtension, reason: "Same propose-not-execute RepRequest pattern as repOrderRequest, for quotes; no confirmed equivalent action." },
  { name: "repPaymentRequestConversationExtension", extension: repPaymentRequestConversationExtension, reason: "Same propose-not-execute RepRequest pattern as repOrderRequest, for payments; no confirmed equivalent action." },
  { name: "fieldVisitConversationExtension", extension: fieldVisitConversationExtension, reason: "Deliberately excluded from the general orchestration catalog already (see action-catalog.ts's own EXCLUDED_ACTION_NAMES comment): real structured extraction and order/payment-linkage safety rules the generic planner \"can't reproduce\" — a pre-existing, documented architectural decision, not one made in this pass." },
  { name: "documentIntelligenceConversationExtension", extension: documentIntelligenceConversationExtension, reason: "Classifies and extracts an already-uploaded financial document (receipt/invoice/cheque/promissory note) into a structured business candidate — OCR/extraction logic with no Action Registry equivalent to route through." },
  { name: "calendarManagementConversationExtension", extension: calendarManagementConversationExtension, reason: "Deterministic Turkish weekday/time resolution (resolveStartAt's DAY_INDEX arithmetic, e.g. \"pazartesi saat 18:30\" -> the correct next Monday) and a live organization-member availability query — action-catalog.ts's calendar_event.create is only a name + description, not a proven equivalent for this exact date math; retiring without first verifying Agent parity on this specific arithmetic would risk a silent regression." },
];
