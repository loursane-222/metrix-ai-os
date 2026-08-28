> **SUPERSEDED 2026-08-02** — §5 (Living Workspace Integration) described below is now complete and ACCEPTED. See `METRIX_OFFER_OPERATION_HANDOFF.md` for current status and the next operation. Kept here for history only.

# METRIX — Offer Capability Session Handoff

Prepared: 2026-08-02 (session closing here due to context limit, continued in a new chat). Written as one piece per explicit instruction. No further development happens after this file is written in this session.

Status vocabulary used below: `IMPLEMENTED_PENDING_PRODUCTION_ACCEPTANCE` (not `ACCEPTED`) — this is Offer's current, final status for this session. **Offer is NOT ACCEPTED.**

---

## 1. Definitively completed this operation

- Full Offer (Teklif) capability built end-to-end, mirroring the Customer ACCEPTED reference chain at the **data/action-runtime layer**:
  - Schema: `QuoteItem` line-item table + `Quote` commercial fields (validUntil, generalDiscountBasisPoints, paymentTerm, deliveryTerm, deliveryMethod, customerNote) — additive migration.
  - Domain: `quote-totals.ts` (pure money math), `quote-item.repository.ts`, `updateQuoteWithVersionGuard` (replace-on-commit item/field patch, mirrors `customer.update`'s version-guard pattern), `sendQuoteToCustomer` (internal DRAFT→SENT transition + audit + notification), `dispatchQuoteToCustomerEmail` (real external email dispatch).
  - Action Runtime: `quote.update`, `quote.send`, `quote.dispatch` all registered through the exact same `productionExecutionRuntime` / `actionRegistry` / gateway pattern as `customer.update`/`customer.archive` — traced and proven via grep, not assumed. `quote.dispatch` uses `approvalPolicy: "EXPLICIT"`, the same `policyEngine`/`ApprovalGrant` request→confirm flow as `customer.archive`.
  - Conversation: `offer-edit-*` files mirror `customer-edit-*` exactly (draft, surface runtime, command contract/resolver/apply, AI adapter). `offer-edit-conversation-extension.ts` and `offer-management-conversation-extension.ts` are both registered into the existing `active-conversation-extension.ts` dispatch list alongside Customer's extensions — no second execution authority.
  - Real external dispatch capability (this did not exist before this session): found the existing approved provider (Resend, verified `metrixgm.com` sending domain, already used for OTP delivery in `email.service.ts`), extracted it into one shared `sendTransactionalEmail()` authority at `src/lib/core/email/resend-provider.ts` so OTP and Offer dispatch stop each building their own client. `quote.dispatch` resolves the real customer email, sends via that shared authority, records provider result + audit event + notification, and returns a typed `MISSING_RECIPIENT_EMAIL`/`NOT_SENT`/`PROVIDER_FAILED` outcome rather than ever fabricating success.
  - Fixed a real bug found during local verification: `quote.sent` notifications had no `recipientUserId`, so they were created but invisible in the actual notifications inbox. Fixed to match the existing `task.created` convention (recipient = actor, notification failure treated as non-critical).
  - Full architectural self-audit completed with file/line evidence (not assertion): single canonical owner confirmed per concern (totals, item mutation, status transition, events, notification, dispatch); no duplicate draft runtime, AI-provider gateway, or conversation-extension dispatcher; one honest duplication found and left as-is with reasoning (`quotes-client.ts`'s fetch wrapper duplicates `customers-client.ts`/`tasks-client.ts` — confirmed as existing repo convention, not a new pattern).
- Local verification (before deploy): typecheck clean, 231 test files / 1924 tests passing (0 failures — one regression I introduced during the Resend-extraction refactor was found and fixed, plus two pre-existing golden-list contract tests updated to reflect the newly-registered actions/live surface), production build clean.
- Full CRUD acceptance cycle (create → add item → discount → save → reopen → delete last item → send) manually verified working correctly in **local dev** browser before touching production.

## 2. Deployed to Production + verified (real evidence, not inferred)

- Commit `0cde6ad` — `feat(offers): production-complete Offer capability on the Customer reference chain` — committed and pushed to `origin/main`.
- Vercel's GitHub integration auto-deployed from the push. Verified via `vercel inspect https://metrix-ai-cozdqr0cu-loursane-222s-projects.vercel.app`:
  - `status: ● Ready`
  - Aliased to `https://metrixgm.com` (confirmed in the Aliases list)
  - Build log line: `Cloning github.com/loursane-222/metrix-ai-os (Branch: main, Commit: 0cde6ad)` — matches `git log -1` exactly.
  - Build log confirms the production migration ran for real: `Applying migration 20260802120000_add_quote_items` → `All migrations have been successfully applied` → `[deploy] Production Prisma migrations completed.` against the real Supabase production database (`aws-0-eu-west-1.pooler.supabase.com`), via the standard `prisma migrate deploy` path in `scripts/production-migrate.mjs`.

## 3. Acceptance — completed vs not completed (this is the binding list)

**Completed with real production evidence** (authenticated as `loursane@gmail.com`, org "Duru Mermer", role OWNER — the user's own real account, real org, not a seeded/synthetic session):
- Created a real production customer "Atlas Insaat" (`POST /api/customers/actions/create` via the direct `/metrix/customers/new` form — the chat-based creation path was flaky this session, see §4).
- "Atlas Insaat icin yeni teklif hazirla" → a real DRAFT `Quote` record was created (`POST /api/quotes` fired for real against production) and the Offer Edit UI opened showing it.

**Not yet completed** (session ended here — interrupted first by a required architectural correction, §5, then by this context-limit handoff):
- Add multiple line items via natural conversation — not re-run in production for this record (was verified working in local dev earlier in the session, on a different local-DB quote).
- Change quantity / unit price via conversation.
- Apply and remove discount via conversation.
- Set payment and delivery terms.
- Save → canonical Action Runtime persistence, verified via re-fetch.
- Reopen the same quote in the same conversation.
- Reload the page and reopen (read-back proof).
- Start a new conversation and open the same quote (cross-conversation persistence proof).
- "Son kalemi sil" → persistence + read-back.
- "Teklifi müşteriye gönder" → explicit confirmation boundary, **preview only** (recipient/content/channel), no real email fired — the user has repeatedly and explicitly required their fresh, per-instance confirmation before any real dispatch, and that has not been given in this session.
- Verify the real Notifications page after the send action.
- Verify read-back of SENT status, audit event, and notification after a page reload and in a new conversation.

**Conclusion: Offer is `IMPLEMENTED_PENDING_PRODUCTION_ACCEPTANCE`, not `ACCEPTED`.** Do not report it as accepted until every item above has real production evidence AND the presentation-layer fix in §5 is live and re-verified.

## 4. Open technical blockers / friction (not architectural — tooling/environment notes)

- **Browser-automation coordinate-mapping bug (tooling, not product):** the `computer` tool's `left_click` with a raw `coordinate` parameter expects **real viewport pixel coordinates** (e.g. 1280×800), not the downscaled screenshot image's pixel space (screenshots render smaller, e.g. 800×500 for a 1280×800 viewport, ~0.625× scale). Eyeballing coordinates from a screenshot and passing them directly caused many misfired clicks this session. Working fix: read the target element's real `getBoundingClientRect()` via `javascript_tool` and click at those exact coordinates, or — most reliable when clicks keep missing — trigger `element.click()` directly via `javascript_tool` (used successfully for the customer-create "Oluştur" button and the chat "Gönder" button after repeated coordinate-click failures). Prefer `ref`-based clicks from `read_page` first; always verify the actual outcome via a network/DOM check, not just a screenshot.
- **Production session dropped once mid-session** for an unexplained reason (not caused by anything in this diff — no auth/session code was touched besides the OTP email *template* extraction, which doesn't touch session logic). Re-authenticated via a fresh OTP flow; the user entered the code themselves (per the credential-entry safety rule — never enter OTP/password/token values on the user's behalf, even with explicit permission; only navigate to the login screen and fill the email field). Session is currently valid.
- **Chat-based customer creation was flaky in production this session** — got a generic "AI response repair failed" error once, and separately the AI asked for disambiguation against unrelated pre-existing similarly-named customers ("Atlas", "Atlas 9d8fbf4", "ACCEPTANCE Atlas 9d8fbf4" — leftover data from a different/prior session's production-acceptance script runs, not created in this session). This is pre-existing `customer-management-conversation-extension.ts` behavior, not something touched or introduced this session. Worked around via the direct `/metrix/customers/new` form. Not investigated further — flagged as a possible pre-existing production issue worth a separate look, out of scope for Offer.

## 5. Living Workspace / single-page product model — the critical finding

Mid-session, the user corrected a real architectural gap. Confirmed by direct code reading, not assumption:

**The actual, already-ACCEPTED product model** (proven working today for Customer and Task): METRIX has **one page**, `/metrix`. `ExecutiveAppShell.tsx` renders `<LivingWorkspaceHost conversation={children}/>` — a split view (chat left, "Çalışma Alanı" work surface right, both visible, same URL) — **only when `pathname === "/metrix"`**. Any other pathname renders `children` as a plain full page and **loses the chat panel entirely**.

The real mechanism: chat utterance → `business-navigation.ts` resolves a target → `dispatchConversationNavigation(...)` → `ExecutiveNavigationCommandHost.tsx` calls `createCustomerWorkspaceDirective(route)` (or `createTaskWorkspaceDirective`), which regex-matches the route into a validated `WorkspaceDirective` (domain, `businessSurface`, `entityId`) → `livingWorkspaceRuntime.publish(directive)` → `LivingWorkspaceHost` (already mounted) re-renders `resolveBusinessSurface(directive)` from `BusinessSurfaceResolver.tsx`, which for known surfaces returns the real screen component with **`presentation="living"`** (e.g. `<CustomerEditScreen customerId={...} presentation="living"/>`) rendered inline in the right panel. **The URL never changes; the chat panel never unmounts.**

**What's wrong with what I built:** Offer's UI is standalone Next.js page routes (`/metrix/offers/[quoteId]/edit`, `/metrix/offers/create/[customerId]`), and `offer-management-conversation-extension.ts`'s `navigate()` calls raw `window.location.assign(path)` — a full browser navigation that drops the chat panel and changes the URL. This is exactly the "page" model the user is eliminating. Confirmed, not speculative.

Also confirmed: `/metrix/offers` (list) was **already** doing raw page navigation even before this session — `business-navigation.ts`'s `offers.list` handling predates this session and was never wired into the directive system either (`ExecutiveNavigationCommandHost` doesn't recognize `/metrix/offers`, so it falls through to `router.push`). Pre-existing gap, not introduced this session, but should be fixed as part of the same corrective work.

**The fix is fully scoped, evidence-based, and additive-only (no restructuring of the existing closed system) — research is done, implementation had not started when this handoff was requested:**

1. `src/lib/living-workspace/contracts.ts` — add `"offer"` to `WORKSPACE_DOMAINS` (currently `["company","customer","product","notification","task"]`); add `DOMAIN_RULES.offer` (entities: `["Quote"]`, fields from Quote's exposed columns, plus a bespoke route regex like customer's `/^\/metrix\/offers(?:\/[^/]+(?:\/edit)?)?\/?$/`-style bypass covering `/metrix/offers`, `/metrix/offers/create/[customerId]`, `/metrix/offers/[quoteId]/edit`); extend the `businessSurface` union type with `"offer-edit"` (see point 5 re: whether `"offer-create"` is even needed) both in the type declaration and in `validateWorkspaceDirective`'s runtime array-membership check.
2. `src/lib/living-workspace/domain-adapters.ts` — add `DOMAIN_SURFACE_ADAPTERS.offer` (entityTypes `["Quote"]`, endpoint `/api/quotes`, field registry from Quote's columns) — needed for type completeness (`Record<WorkspaceDomain, DomainSurfaceAdapter>`) and so the generic list surface (`offers.list`) works the same way `customers`/`tasks` list already does.
3. `src/lib/living-workspace/planner.ts` — add `CONFIG.offer` (entityType `"Quote"`, title `"Teklifler"`, type `"entity-list"`, route `/metrix/offers`, columns e.g. `["customerName","title","amount","status","updatedAt"]`) for the list-case base directive; add a new exported `createOfferWorkspaceDirective(input: {route, source, correlationId, now?})`, mirroring `createCustomerWorkspaceDirective`/`createTaskWorkspaceDirective` exactly: regex-match `/metrix/offers/[quoteId]/edit` → `businessSurface: "offer-edit"`, `entityId = quoteId`; bare `/metrix/offers` → no `businessSurface` (falls to generic list surface).
4. `src/components/input-authority/ExecutiveNavigationCommandHost.tsx` — extend the chain: `createCustomerWorkspaceDirective(...) ?? createTaskWorkspaceDirective(...) ?? createOfferWorkspaceDirective(...)`.
5. `src/components/living-workspace/BusinessSurfaceResolver.tsx` — add: `directive.businessSurface === "offer-edit" && directive.entityId` → `<OfferEditScreen quoteId={directive.entityId} presentation="living"/>`. **Open design question for the new session to resolve, not re-litigate from scratch:** does Offer need a distinct `"offer-create"` business surface at all? Unlike Customer's create flow (multi-turn client-side draft *before* persistence), Offer creation already resolves the customer and creates the real `Quote` row server-side inside `offer-management-conversation-extension.ts` *before* any navigation happens — so by the time a directive would be published, the entity already exists. Likely conclusion: skip a distinct create surface, have the extension dispatch straight to the post-creation `offer-edit` directive (route `/metrix/offers/{quoteId}/edit`), and `OfferCreateRedirect.tsx`/`/metrix/offers/create/[customerId]` may become unnecessary. Also extend `resolveBusinessSurfaceAuthorityKey` for `"offers.list.page"`/`"offers.edit.page"` to match what `business-navigation.ts` already emits.
6. `src/components/offers/OfferEditScreen.tsx` — add a `presentation?: "route" | "living"` prop, mirroring `CustomerEditScreen`'s dual-mode `PageHeaderShell` branch exactly: in `"living"` mode, skip the fixed-viewport `PageShell` (`h-dvh max-h-dvh overflow-hidden`) and render just the content in a simple scrollable container (`<div className="mx-auto h-full min-h-0 w-full max-w-3xl overflow-y-auto overscroll-contain px-1 pb-6">{children}</div>`, matching Customer's living-mode wrapper). The existing route-mode pages stay as valid direct-URL/bookmark entry points (`presentation="route"`, current default) — per the user's own words, "Route bulunabilir; ancak route ürün modeli değildir" — they're just no longer the *primary* way chat opens the surface.
7. `src/lib/conversation-extensions/offer-management-conversation-extension.ts` — replace `window.location.assign(path)` in `navigate()` with the structured `dispatchConversationNavigation({ route, source, correlationId, expectedSurfaceAuthorityKey })` object-form call (see `customer-navigation-runtime.ts`'s `dispatchCustomerNavigationCommand` for the exact analogous pattern used by Customer's create flow — the closest real precedent, since both need the full directive-publish path rather than the simpler string/`router.push` overload used for plain existing-record navigation).
8. `src/lib/executive-request-resolution/business-navigation.ts` — likely needs **no further change**; its existing `offer.create`/`offer.edit` → `{route, expectedSurfaceAuthorityKey}` output should already be correct input once the dispatch call in point 7 is wired.

Estimated size: moderate, ~7-8 files, almost entirely additive blocks that follow the exact existing per-domain pattern already proven for `task` and `customer` — no new mechanism, no second system.

## 6. First concrete task for the new session

1. Read this file in full before doing anything else.
2. Implement §5, items 1–8, exactly as scoped — the pattern is fully mapped with exact file names and exact functions to mirror; no re-research needed.
3. Typecheck + full test suite + production build, locally.
4. Manually verify in local dev browser: "Atlas ... için teklif hazırla" opens the Offer surface **inline next to chat, on `/metrix`, URL unchanged, chat panel stays visible and mounted** — this is the actual pass/fail bar, not just "no error thrown."
5. Commit, push to `main`, deploy (same process: Vercel auto-deploys on push; verify once via `vercel inspect` for Ready status + matching commit hash — do not poll repeatedly, per standing guidance).
6. Resume the authenticated production acceptance flow from exactly where §3 leaves off. The customer **"Atlas Insaat" already exists in production** — check via `GET /api/customers` first, do not recreate it. Run every remaining item in §3's "not yet completed" list against the now-Living-Workspace-integrated surface.
7. For "Teklifi müşteriye gönder": call the dispatch **request/preview phase only** (`POST /api/quotes/[quoteId]/actions/dispatch` with `operation: "request"`) to show real recipient/content/channel. Do **not** call `operation: "confirm"` (fires a real email via Resend) without the user's fresh, explicit, per-instance confirmation in the new session — prior permission does not carry over automatically, and the user has repeatedly required this exact boundary.
8. Only once every item in §3 has real production evidence *and* §5's presentation fix is live and re-verified, write the final Offer acceptance report.
9. Only after Offer is genuinely `ACCEPTED`, move automatically to the next highest-priority capability per the original mission brief — do not ask whether to continue, per the user's standing instruction.

## 7. Settled — do not re-analyze

- The architectural self-audit conclusions in §1 (single canonical Action Runtime authority for `quote.update`/`send`/`dispatch`; no duplicate planner/coordinator/runtime/persistence-owner/notification-owner) — proven with grep evidence, documented, do not redo.
- The migration-safety analysis (the local dev-DB checksum drift encountered mid-session was pre-existing and disk-only, unrelated to this migration; production's `prisma migrate deploy` applied `20260802120000_add_quote_items` cleanly — confirmed via the actual production build log, not inferred) — settled.
- The external-dispatch architecture decision: reuse the existing approved Resend provider (already used for OTP, verified `metrixgm.com` sending domain) via one new shared `sendTransactionalEmail()` authority, gated behind `quote.dispatch`'s `EXPLICIT` approval policy (same `policyEngine`/`ApprovalGrant` mechanism as `customer.archive`) — built, settled; do not redesign or consider stubbing/faking delivery.
- The browser-automation coordinate-mapping issue (§4) — workaround is known and documented; do not re-diagnose from scratch.
- The correctness of the underlying CRUD/discount/totals/persistence logic itself (`updateQuoteWithVersionGuard`, `quote-totals.ts`, replace-on-commit item semantics) — already verified correct in local dev browser testing (full item-add/discount/delete/send cycle) and in the one production step that did complete (customer + draft creation). The remaining gap is presentation/integration (§5), not data-layer correctness — do not re-audit the data layer before fixing §5.
- Whether Customer's operation model is the canonical one every capability must mirror — that is the mission's explicit, unchallengeable premise. §5 is a finding about a place this session under-mirrored it, not a challenge to the premise itself.
- Never enter OTP codes, passwords, or tokens on the user's behalf, even with explicit permission and even if the user pastes the code directly in chat — state the rule, ask them to enter it themselves in the visible Browser pane.

---

**Files this new session needs:**
- `METRIX_OFFER_SESSION_HANDOFF.md` — this file (repo root, uncommitted by design — user did not ask it committed).
- `CLAUDE.md`, `AGENTS.md` — repo root, unchanged, auto-loaded.
- `src/components/customers/CustomerEditScreen.tsx` — the `presentation="living"` pattern to replicate exactly (§5.6).
- `src/lib/customers/customer-navigation-runtime.ts` — the `dispatchConversationNavigation` object-form call pattern to replicate (§5.7).
- `src/lib/living-workspace/planner.ts`, `contracts.ts`, `domain-adapters.ts` — the three closed config objects to extend additively (§5.1–5.3).
- `src/components/input-authority/ExecutiveNavigationCommandHost.tsx`, `src/components/living-workspace/BusinessSurfaceResolver.tsx` — the two wiring points (§5.4–5.5).
- `prisma/schema.prisma` — current canonical data model (Quote/QuoteItem already added this session).

This report is deliberately not committed to git — it is working/handoff material, not part of the product.
