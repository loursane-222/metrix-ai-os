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
import { reportSubmissionConversationExtension } from "./report-submission-conversation-extension";
import { reportReviewConversationExtension } from "./report-review-conversation-extension";
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
import { orchestrationApprovalConversationExtension } from "./orchestration-approval-conversation-extension";
import { calendarManagementConversationExtension } from "./calendar-management-conversation-extension";

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

// Retired from active dispatch (Legacy Domain Semantic Ownership Final
// Consolidation, plus the follow-up Residual Capability Parity Migration):
//   production-management   -> production.create (42 lines, thin create wrapper)
//   business-overview        -> retired as a Class D business-judgment owner;
//                              the Agent's own tools already answer whole-
//                              business questions and this extension (34
//                              lines) computed nothing itself.
//   task-management          -> task.create (Action Registry parity already
//                              existed; the extension had no deterministic
//                              sub-logic of its own). Was briefly kept
//                              residual because retiring it exposed a real
//                              collision with fieldVisitConversationExtension's
//                              grammar — now moot, since fieldVisit itself
//                              is retired below.
//   field-visit               -> log_field_visit_report / get_field_visit_weekly_summary
//                              Agent tools (residual-capability-tools.ts),
//                              thin wrappers around the SAME
//                              processFieldVisitReport /
//                              resolveFieldVisitWeeklySummaryRequest service
//                              functions the extension's own API routes
//                              already called — including the narrowly-
//                              scoped orders.write/payments.write permission
//                              elevation for the conditional order/payment
//                              a visit report can produce, unchanged.
//   rep-goal-create           -> submit_rep_goal_report Agent tool, wraps
//                              processRepGoalReport unchanged (manager-role
//                              gate included).
//   rep-order-request,
//   rep-quote-request,
//   rep-payment-request       -> ONE shared propose_rep_request Agent tool
//                              (domain: ORDER|QUOTE|PAYMENT), wraps the
//                              SAME proposeRepRequest orchestrator all three
//                              extensions already called — the propose-not-
//                              execute authority model (a pending RepRequest
//                              only, never a real order/quote/payment) is
//                              unchanged; repRequestReviewConversationExtension
//                              (CANONICAL_CONTINUATION_APPROVAL, below) is
//                              still the only path that can approve one.
//   supplier-message           -> send_supplier_message Agent tool wraps
//                              sendSupplierMessage unchanged (resolves the
//                              supplier server-side via the same
//                              resolveSupplierReference algorithm, now fed
//                              from the server-side supplier.service instead
//                              of the browser suppliers-client).
//   document-intelligence      -> analyze_active_document_attachment Agent
//                              tool (residual-capability-tools.ts). The
//                              classify/extract logic itself was extracted
//                              verbatim (no rewrite) from the two API
//                              routes into document-intelligence-orchestrator.service.ts,
//                              which both the routes AND this tool now call
//                              — no reimplementation, no duplicate OCR path.
//                              The active attachment reference is now
//                              plumbed as trusted structured context
//                              (ExecutiveAgentRunContext.activeDocumentAttachment,
//                              sourced from the client's own
//                              document-attachment-session.ts pointer, sent
//                              alongside activeWorkspaceContext in route.ts)
//                              — never guessed from free text. The "user
//                              text must never silently override document
//                              evidence" cross-check (requested domain vs.
//                              the document's own independent
//                              classification) is preserved unchanged.
//   calendar-management        -> resolve_calendar_expression /
//                              find_organization_member_for_calendar /
//                              query_member_availability Agent tools
//                              (calendar-semantic-tools.ts). calendar_event.create/
//                              update/status_transition/reschedule were
//                              ALREADY full canonical Action Registry
//                              actions reachable via execute_business_action,
//                              INCLUDING native conflict detection
//                              (CanonicalOperationResultV1 status
//                              "CONFLICT" + an allowConflict input flag) —
//                              the extension's own 409+confirm/discard
//                              client-side dance was a legacy
//                              reimplementation of something the canonical
//                              action already did; no new write plumbing
//                              was needed, only the deterministic date math
//                              and member-name resolution the extension
//                              also used to own. The extension itself is
//                              narrowed to ONLY its pure "takvimi göster"
//                              navigation branch and reclassified
//                              PRESENTATION_NAVIGATION below — it no longer
//                              mutates anything, so it is no longer a
//                              residual at all.
//   payment-reminder           -> compose_payment_reminder_whatsapp Agent
//                              tool (residual-capability-tools.ts) resolves
//                              the customer, mints the public statement
//                              link, and builds the exact same message text
//                              (formatBalances/whatsappNumber, imported
//                              unchanged from this now-fully-retired
//                              extension) — but hands the CLIENT a typed
//                              clientAction instruction instead of opening
//                              a tab itself, since a server-side Node
//                              process cannot call window.open. The client
//                              (MetrixChatTab.tsx's MetrixBubble) renders a
//                              button from that trusted instruction; only a
//                              real, later user CLICK performs window.open
//                              — never auto-triggered, so no browser ever
//                              treats it as a blocked popup, and the client
//                              never independently interprets business
//                              intent (it only executes what the Agent
//                              already fully resolved). The extension's own
//                              formatBalances stays exported and imported
//                              by the new tool (not duplicated); the
//                              extension object itself is now fully
//                              unreachable from active dispatch.
//   team-management             -> organization_member.create (a NEW
//                              canonical Action Registry action added this
//                              operation, team.actions.ts) for invites, and
//                              the ALREADY-canonical organization_member.update
//                              for role-change/enable/disable — both wrap
//                              the exact same canonical services
//                              (inviteOrganizationMember/manageOrganizationMember)
//                              this extension's own fetch calls hit.
//                              entity-resolvers.ts gained a NEW
//                              "organizationMember" domain (memberId ->
//                              resolveByLabel against real members, the
//                              same generic algorithm every other domain
//                              already uses) so the Agent never guesses a
//                              real id. The extension itself is narrowed to
//                              ONLY its pure "ekibi göster" navigation
//                              branch and reclassified PRESENTATION_NAVIGATION
//                              below — it no longer mutates anything.
// A cold utterance these used to catch now falls through to NOT_HANDLED
// here, reaching the Executive Agent instead, which calls the matching new
// tool itself.
//
// NOT yet retired, and deliberately NOT registered below either — kept
// fully active and reachable exactly as before, because retiring them
// would remove real, currently-unreplicated capability (see the file
// header and the operation's final report for the itemized reason per
// extension): customerManagementConversationExtension,
// offerManagementConversationExtension, orderManagementConversationExtension,
// deliveryManagementConversationExtension, invoiceManagementConversationExtension,
// paymentManagementConversationExtension, stockManagementConversationExtension.
export const REGISTERED_EXTENSIONS: readonly RegisteredExtension[] = [
  // --- PRESENTATION_NAVIGATION: pure open/show/navigate, no mutation ---
  { name: "financeManagementConversationExtension", extension: financeManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "calendarManagementConversationExtension", extension: calendarManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "teamManagementConversationExtension", extension: teamManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
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
  { name: "orderManagementConversationExtension", extension: orderManagementConversationExtension, reason: "166-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against order.* actions within this pass." },
  { name: "deliveryManagementConversationExtension", extension: deliveryManagementConversationExtension, reason: "137-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against delivery.* actions within this pass." },
  { name: "invoiceManagementConversationExtension", extension: invoiceManagementConversationExtension, reason: "112-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against invoice.* actions within this pass." },
  { name: "paymentManagementConversationExtension", extension: paymentManagementConversationExtension, reason: "108-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against payment.*/collection.* actions within this pass." },
  { name: "stockManagementConversationExtension", extension: stockManagementConversationExtension, reason: "141-line multi-stage coordinator not individually verified sub-stage-by-sub-stage against stock.* actions within this pass." },
];
