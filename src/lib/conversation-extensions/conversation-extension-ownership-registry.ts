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
 * Final Residual Parity Closure: RESIDUAL_LEGACY_EXTENSIONS is now empty.
 * Every extension that used to need this escape hatch (structured document
 * extraction, field-visit order/payment-linkage safety rules, field-rep
 * propose-not-execute workflows, a rep's own goal-setting report,
 * WhatsApp-compose utilities, customer-management's own 6 sub-stages) now
 * has a canonical destination — either a new/existing Action Registry
 * entry reachable via execute_business_action, a new Executive Agent tool
 * (residual-capability-tools.ts, calendar-semantic-tools.ts) wrapping the
 * exact same underlying service call unchanged, or — for the one
 * genuinely stateful, Workspace-surface-bound piece
 * (customerAttachmentConversationCoordinator) — its own
 * CANONICAL_CONTINUATION_APPROVAL entry below. See each domain's own
 * closure comment further down for the itemized capability-by-capability
 * mapping.
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
import { offerManagementConversationExtension } from "./offer-management-conversation-extension";
import { customerDocumentAttachmentConversationExtension } from "./customer-document-attachment-conversation-extension";
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
//   invoice-management          -> fully retired, no new plumbing needed:
//                              invoice.create (customerId/title/amount/quoteId)
//                              was ALREADY a complete canonical Action
//                              Registry action, and quoteId was ALREADY a
//                              resolvable entity reference (entity-resolvers.ts)
//                              for a NAMED quote. The one genuine gap — this
//                              extension's "Atlas teklifinden fatura kes"
//                              phrasing, which never names the quote, only
//                              infers "the customer's own quote with a
//                              positive amount" — is closed by a new
//                              find_customer_open_quote Agent tool carrying
//                              the exact same filter rule
//                              (resolveInvoiceSourceQuote, same file,
//                              ported not reused directly since its
//                              QuoteRecord type differs from quote.service's
//                              raw shape). No navigation-only capability
//                              existed to preserve — a bare "faturaları
//                              göster" (no create verb) never matched this
//                              extension's own grammar even before this
//                              operation.
//   payment-management          -> fully retired, no new plumbing needed:
//                              payment.create (customerId/title/amount/
//                              dueDate) was ALREADY a complete canonical
//                              Action Registry action. The one genuine
//                              piece worth preserving — the deterministic
//                              "vadesi 5 gün önce geçti"/"30 gün vadeli"
//                              relative-date math — is closed by a new
//                              resolve_relative_due_date Agent tool, same
//                              arithmetic, moved not rewritten. No
//                              navigation-only capability existed to
//                              preserve.
//   delivery-management         -> 3 NEW canonical actions
//                              (delivery.createFromOrder wraps
//                              createDeliveryFromOrder — auto-derives
//                              customer+items from the source order, a
//                              distinct capability from plain
//                              delivery.create; delivery.recordProof wraps
//                              recordProofOfDelivery; delivery.addException
//                              wraps recordDeliveryException) plus 3 NEW
//                              read-only Agent tools
//                              (delivery_carrier_performance,
//                              delivery_performance, shipment_integrity —
//                              same delivery-intelligence.service functions
//                              the extension's own API routes already
//                              called). The extension itself is narrowed to
//                              ONLY its pure list/create-form/open-by-
//                              reference navigation branches and
//                              reclassified PRESENTATION_NAVIGATION below.
//   order-management            -> 3 NEW canonical actions
//                              (order.createFromQuote wraps
//                              createOrderFromQuote — auto-derives
//                              customer+items from a WON quote, a distinct
//                              capability from plain order.create;
//                              order.revise wraps recordOrderRevision;
//                              order.addException wraps
//                              recordOrderException) plus 4 NEW read-only
//                              Agent tools (find_customer_won_quote — same
//                              "most recent WON quote" filter as
//                              findQuoteForCustomer, ported;
//                              delivery_commitment_rate; get_order_details
//                              covers fulfillment/priority/reservation in
//                              one tool since serializeOrder already
//                              computes all three; list_critical_orders).
//                              The extension itself is narrowed to ONLY its
//                              pure list/create-form/open-by-reference
//                              navigation branches and reclassified
//                              PRESENTATION_NAVIGATION below.
//   stock-management             -> stock.transfer was ALREADY a complete
//                              canonical action (no new plumbing). 2 NEW
//                              canonical actions (stock.recordCount wraps
//                              recordPhysicalCount; stock.resolveVariance
//                              wraps resolveInventoryVariance — a distinct
//                              two-step "count then confirm/dismiss"
//                              workflow from the already-existing immediate
//                              stock.adjustment) plus 4 NEW Agent tools
//                              (stock_health, stock_executive_signals,
//                              list_pending_stock_variances,
//                              find_stock_by_product_and_warehouse — the
//                              last resolves a real stockId from the
//                              already-resolvable product/warehouse
//                              entity-reference domains, since stockId
//                              itself is a distinct row from either alone).
//                              The extension itself is narrowed to ONLY its
//                              pure list/operations-form/open-by-reference
//                              navigation branches and reclassified
//                              PRESENTATION_NAVIGATION below.
//   offer-management            -> quote.create was ALREADY a complete
//                              canonical action once its manifest's amount
//                              field was corrected from incorrectly-
//                              required to optional (quotes.actions.ts) —
//                              matching handleQuoteCreate's own real
//                              contract and this extension's own
//                              documented "bare draft, hand off to Edit
//                              workspace for pricing" design. The
//                              WhatsApp-compose branch's client-only half
//                              (window.open) moved to a new
//                              compose_offer_whatsapp Agent tool
//                              (residual-capability-tools.ts), same bridge
//                              pattern as payment-reminder's WhatsApp
//                              branch — plus a new
//                              find_customer_most_recent_quote tool (a
//                              THIRD distinct "find the customer's quote"
//                              filter, no status restriction, ported not
//                              shared with find_customer_open_quote/
//                              find_customer_won_quote since each mirrors a
//                              genuinely different rule from its own
//                              extension). The extension itself is
//                              narrowed to ONLY its OPEN_OFFER navigation
//                              branch and reclassified
//                              PRESENTATION_NAVIGATION below.
//   customer-management          -> the FINAL residual family (Final
//                              Residual Parity Closure). Its 6 sub-stages
//                              split three ways:
//                              (1) custom-field DEFINITION management
//                              (customerCustomFieldConversationCoordinator)
//                              -> custom_field.create/update_definition/
//                              deprecate were ALREADY complete canonical
//                              actions (customers.actions.ts) with their
//                              own EXPLICIT-approval flow; they were only
//                              excluded from the general planner's catalog
//                              (action-catalog.ts's EXCLUDED_ACTION_NAMES)
//                              by a stale exclusion inconsistent with
//                              company.field_definition.* (never excluded
//                              for the identical shape of action) — removing
//                              the exclusion was the entire fix, no new
//                              plumbing. definitionId was ALREADY a
//                              resolvable entity reference (entity-resolvers.ts's
//                              "customFieldDefinition" domain).
//                              (2) customer-create multi-turn coordinator
//                              (customerCreateConversationCoordinator) ->
//                              customer.create was ALREADY a complete
//                              canonical action; the coordinator's entire
//                              "collect fields across turns, project into a
//                              mounted create-surface" machinery was a
//                              legacy substitute for what the Agent's own
//                              conversational loop already does natively
//                              (ask for missing fields, call customer.create
//                              once ready) — no porting needed, no capability
//                              lost. The one genuinely new primitive it
//                              owned — resolving a free-text notification
//                              target after a successful create — is now
//                              notify_customer_creation_target (Agent tool,
//                              residual-capability-tools.ts), a thin wrap of
//                              the SAME server-side notifyCreatedCustomerTarget
//                              service the coordinator's own client call hit.
//                              (3) archive confirm/cancel + customer-lookup
//                              archive-request -> customer.archive was
//                              ALREADY a complete canonical action with its
//                              own EXPLICIT-approval request/confirm/cancel
//                              flow (execute_business_action's generic
//                              approval dance, identical in shape to the
//                              extension's own pendingArchive dance) and
//                              customerId was ALREADY a resolvable entity
//                              reference. The only real gap — a deictic "bu
//                              müşteriyi" with no name at all — is closed by
//                              a NEW get_active_workspace_context Agent tool
//                              plus a NEW ExecutiveAgentRunContext.activeWorkspaceContext
//                              field (trusted structured context from the
//                              client's own activeWorkspaceContext pointer,
//                              same plumbing pattern as activeDocumentAttachment)
//                              — the Agent resolves the deictic reference to
//                              a real id itself before calling
//                              execute_business_action; the generic
//                              entity-reference resolver only matches real
//                              record labels, it has no concept of "the one
//                              currently open".
//                              (4) customer-update (regex "X'in Y Z olsun"
//                              value-set on an existing customer, custom OR
//                              built-in field) -> customer.update was
//                              ALREADY a complete canonical action; the one
//                              genuinely new piece — matching a free-text
//                              field label against custom-then-built-in
//                              field definitions, checking clearable/writable,
//                              and normalizing the raw value into the exact
//                              patch shape customerUpdateHandler.ts expects
//                              (normalizeFieldValue, ported unchanged) — is
//                              now resolve_customer_field_value (Agent tool),
//                              which also resolves the customer (by name, or
//                              the same activeWorkspaceContext deictic
//                              fallback) and fetches its current updatedAt
//                              for the required expectedVersion, so the
//                              Agent never has to invent either.
//                              (5) attachment-notify + document-extraction
//                              preview/duplicate-review/apply/commit
//                              (customerAttachmentConversationCoordinator) ->
//                              this ONE stage could not become a stateless
//                              tool — it drives an actively mounted "customer
//                              create" Workspace surface via a command
//                              channel and a browser-session attachment
//                              reference, genuinely stateful multi-turn UI
//                              orchestration. Extracted verbatim (same
//                              coordinator, unchanged) into its own new
//                              customerDocumentAttachmentConversationExtension,
//                              classified CANONICAL_CONTINUATION_APPROVAL
//                              below (every branch except the bare
//                              NOT_ATTACHMENT_INTENT fallback requires a
//                              pre-existing attachment/preview session
//                              anchor — it never originates a cold business
//                              intent with nothing already pending).
//                              customerManagementConversationExtension itself
//                              (the old combined coordinator file) is now
//                              fully unreachable from active dispatch —
//                              left in place, orphaned, exactly like
//                              invoice/payment-management above (its own
//                              existing unit tests keep testing it directly,
//                              in isolation, unchanged).
// A cold utterance these used to catch now falls through to NOT_HANDLED
// here, reaching the Executive Agent instead, which calls the matching new
// tool itself.
//
// Final Residual Parity Closure: every family from the original 11-item
// residual list now has a canonical destination. RESIDUAL_LEGACY_EXTENSIONS
// is empty (see below) — this file's own three-authority classification
// covers every remaining active extension.
export const REGISTERED_EXTENSIONS: readonly RegisteredExtension[] = [
  // --- PRESENTATION_NAVIGATION: pure open/show/navigate, no mutation ---
  { name: "financeManagementConversationExtension", extension: financeManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "calendarManagementConversationExtension", extension: calendarManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "teamManagementConversationExtension", extension: teamManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "deliveryManagementConversationExtension", extension: deliveryManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "orderManagementConversationExtension", extension: orderManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "stockManagementConversationExtension", extension: stockManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
  { name: "offerManagementConversationExtension", extension: offerManagementConversationExtension, authority: "PRESENTATION_NAVIGATION" },
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
  { name: "customerDocumentAttachmentConversationExtension", extension: customerDocumentAttachmentConversationExtension, authority: "CANONICAL_CONTINUATION_APPROVAL" },

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

// Final Residual Parity Closure: empty. Every extension that used to be
// listed here (customer-management was the last) now has a canonical
// destination — see this file's header for the itemized closure per
// sub-stage. Kept as an exported, typed empty array (not deleted) so a
// future genuine gap has an honest, explicit place to be declared again,
// rather than silently smuggled into REGISTERED_EXTENSIONS under a
// misrepresented authority.
export const RESIDUAL_LEGACY_EXTENSIONS: readonly ResidualLegacyExtension[] = [];
