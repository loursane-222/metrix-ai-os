> **SUPERSEDED 2026-08-02** — see `METRIX_OPERATION_HANDOFF.md` for current status (Task/Notification are now `ACCEPTED`, not pending). Kept here for history only.

# METRIX — Session Handoff Report

Prepared: 2026-08-01. This session is being closed here in a controlled way and continued in a new chat. No new development, commits, pushes, or deploys happen in this report.

---

## 1–5. Git state

| | |
|---|---|
| **Starting HEAD (session start)** | `443fdb0` — "fix(executive-runtime): complete production customer acceptance" |
| **Current local HEAD** | `2883bc2` — "fix(tasks): unify risk classification, fix side-effect consistency, wire reporting" |
| **origin/main** | still at `443fdb0` — nothing has been pushed this session |
| **Local vs origin** | `main` is **5 commits ahead** of `origin/main`, 0 behind |

**Unpushed local commits, oldest first, each with its purpose:**

1. `6cde77e` — chore(consolidation): remove orphaned legacy workspace, add architecture matrix
   Removed the dead `MetrixWorkspace.tsx` + `src/lib/metrix-workspace/` (5,159 lines, localStorage-backed, unreferenced). Removed two stale, verdict-less audit files (`METRIX_LIVING_WORKSPACE_KANIT.txt`, `METRIX_LIVING_WORKSPACE_V1_UYGULAMA_DENETIMI.txt`). Added `METRIX_ARCHITECTURE_MATRIX.md` (constitution-vs-repo audit).
2. `b3843aa` — feat(notifications): add canonical Notification domain
   First new business capability: Prisma model + migration, service/API layer, Living Workspace registration. Chosen first because every later capability's "Notification sistemine bağla" step depends on it, and it didn't exist at all before.
3. `1b36445` — chore(customers): remove duplicate customer.create execution path
   Proved (grep, no client caller) then removed the dead `POST /api/customers` route + its orphaned client wrapper `createCustomer()` + that wrapper's own unit test. The live path (`executeCustomerCreateAction` → `/api/customers/actions/create` → Action Runtime gateway) is untouched.
4. `12ed2ad` — feat(tasks): add Task capability as the reference conversational-mutation chain
   Full chain build: conversation planner/coordinator, Living Workspace surface + command channel, Action Runtime gateway/handler, Prisma model + migration, Notification + Executive Memory calls, `getTaskSummary()`.
5. `2883bc2` — fix(tasks): unify risk classification, fix side-effect consistency, wire reporting
   Registered `task.create` in the actual `actionRegistry` (was missing — would have failed policy evaluation even with valid auth). Fixed a real bug where a Notification/Memory failure after a successful Task write caused the whole action to report FAILURE. Wired Task into the real `domain-evidence` → `executive-operating-context` reporting chain (not a new one).

## 5–6. Worktree status

```
 M src/app/globals.css
 M src/components/living-workspace/ExecutiveAppShell.tsx
 M src/components/metrix-tab/MetrixChatTab.tsx
?? .claude/launch.json
?? design-system/README.md
?? design-system/customers/
?? design-system/global/
?? public/design/executive-dock.svg
?? test-results/
```

These predate this session, are **not related to Notification/Task work**, and were deliberately never touched, staged, or committed by me at any point — every commit this session staged only the exact files belonging to that commit's concern. They remain exactly as they were when this session started. `test-results/` is Playwright output noise, not source.

## 7. Deleted dead code / duplicate authorities

- `src/components/metrix-workspace/MetrixWorkspace.tsx` (3,954 lines) + `src/lib/metrix-workspace/` (2 files, 1,205 lines) — orphaned, localStorage-backed duplicate of the 16 stub domain routes.
- `METRIX_LIVING_WORKSPACE_KANIT.txt`, `METRIX_LIVING_WORKSPACE_V1_UYGULAMA_DENETIMI.txt` — stale, 9-commits-old, verdict-less audit files.
- `POST /api/customers` route handler + `createCustomer()` client wrapper + its test — dead second path around `customer.create` (bypassed the Action Runtime gateway entirely: no idempotency, no permission check, no audit).

## 8. METRIX_ARCHITECTURE_MATRIX.md status

Written in commit `6cde77e`, **before** Notification and Task were built. It still lists both as "hiç uygulanmamış" (Bildirimler/Notifications) or absent (Task/Görevler weren't in the original 20-domain brief list under that name at all — Görevler was). **It has not been updated to reflect the last three commits** — the new session should either update it or treat this handoff report as the current source of truth for Notification/Task status until it is.

## 9. Notification capability — final status

**`IMPLEMENTED_PENDING_ACCEPTANCE`.** Real Prisma model, service/repository, REST API (`GET/POST /api/notifications`, `POST /api/notifications/[id]/read`), real Living Workspace registration and surface (`/metrix/notifications`), `notify()` is the one entry point other domains call. Verified: typecheck, 1917 tests, production build, and one unauthenticated browser check (correct auth-gated empty state, matching Company/Customer/Product's own behavior). **No authenticated acceptance has been run.** Not ACCEPTED.

## 10–11. Task capability — final status and completed chain

**`IMPLEMENTED_PENDING_ACCEPTANCE`.** Chain completed and structurally verified (not yet authenticated-verified):

| Link | Where |
|---|---|
| Conversation | `src/lib/conversation-extensions/task-management-conversation-extension.ts`, registered in `active-conversation-extension.ts` |
| Conversation Understanding / Canonical Planner | `src/lib/tasks/task-create-conversation-planner.ts` (AI-adapter primary path, deterministic fallback), `task-create-conversation-ai-adapter.ts` |
| Living Workspace Surface | `contracts.ts`/`domain-adapters.ts`/`planner.ts` (`task` domain, `task-create` businessSurface), `BusinessSurfaceResolver.tsx`, `TaskCreateScreen.tsx`, `TaskCanonicalScreen.tsx`, routes `/metrix/tasks`, `/metrix/tasks/new` |
| Draft | `task-create-surface-runtime.ts` (`TaskCreateSurfaceRuntime` state machine) |
| Validation | title-required, enforced at both the surface runtime and the handler |
| Approval | `task.create` registered in `actionRegistry` (`tasks.actions.ts`) as `riskLevelBase: LOW`, `approvalPolicy: NONE` — explicit commit gesture is the confirmation, per the shared risk policy (see §13) |
| Action Runtime Gateway | `src/lib/action-runtime/gateway/task-create-gateway.ts` → `productionExecutionRuntime` |
| Domain Service / Persistence | `src/lib/core/tasks/task.service.ts` / `task.repository.ts`, real `Task` Prisma model |
| Notification | `notify()` called synchronously in `task-create-handler.ts`, non-critical, try/caught, audited on failure |
| Executive Memory | `createApprovedMemoryItem()` called synchronously in the same handler, same non-critical/audited treatment — **first production caller of that service anywhere in the codebase** |
| Reporting | `TASK_RECORD` evidence source in `domain-evidence.service.ts`/`.repository.ts`, `projectTaskContext()` in `executive-operating-context-builder.service.ts`, feeding `ExecutiveOperatingContext.taskContext` |

## 12. Task — open acceptance items (explicitly not closed)

- **Authenticated persistence + Notification + Executive Memory side effects**: not proven with a real session. Structurally verified only (mocked unit tests, unauthenticated browser 401 check).
- **Canonical read-back, same conversation**: not proven — after a real user creates a task via conversation, has the created record actually been read back through the canonical API in that same conversation turn?
- **Canonical read-back, new conversation**: not proven — does a fresh conversation (new conversationId) see the same task via the canonical API, proving persistence isn't conversation-local state?

These require a **real login** (OTP to an actual phone). I attempted to close this gap by seeding a session directly via Prisma — the user explicitly stopped me and instructed that no local-session-seeding or DB-writing script is to be run; authenticated acceptance is to be done later with a real user session, in the new chat.

## 13. Action Runtime — proven canonical mutation authority

Traced end-to-end via real code (not assumption), using Customer as the reference (its client `createCustomer()` calls `/api/customers/actions/create`, confirmed the only live path — no client code calls plain `POST /api/customers`, which is why that route was removed):

```
Conversation Coordinator + Planner (per-domain: e.g. CustomerCreateConversationCoordinator,
  TaskCreateConversationCoordinator)
  → Living Workspace Surface + Command Channel
    (opens the real form surface, fills fields via dispatch*CreateCommand,
     state machine COLLECTING → READY → SUBMITTING)
  → explicit user commit (the approval gesture)
  → POST /api/{domain}/actions/create
  → Action Runtime Gateway (execute*Gateway, e.g. task-create-gateway.ts)
  → productionExecutionRuntime.executeAction()
    → PolicyEngine.evaluatePolicy() [ACTUALLY WIRED — reads actionRegistry
      (riskLevelBase/approvalPolicy/requiredPermissionSet), computes risk via
      computeRuntimeRisk(), decides ALLOW/DENY/REQUIRES_APPROVAL]
    → registered ActionHandler (e.g. taskCreateHandler)
  → Domain Service → Prisma
  → auditStore.append() (real per-process audit trail)
  → idempotencyStore (real per-process duplicate protection)
```

This is the ONE canonical authority. `task.create` is now correctly registered into it (was missing until this session's last commit — see §11/Approval).

## 14. Dead executive-request-resolution / executive-action-presence / executive-runtime-adapters

**Confirmed dead, still present, not removed.** Traced with file-level evidence: `executive-request-resolution`'s composition root explicitly comments "registers no mutation provider"; it runs only as fire-and-forget shadow telemetry (`void observeShadowExecutiveRequestResolution(...)`, result discarded); `executive-action-presence-runtime.ts` and `executive-runtime-adapter-registry.ts` have **zero callers outside their own tests**, for any domain including Customer. This is fully-built, tested, but functionally inert infrastructure that duplicates the real Action Runtime's conceptual role. **No decision has been made yet on whether to deprecate/remove it** — this was flagged as a real architecture fork, not resolved, and deliberately not acted on unilaterally given its size and the fact it represents real prior investment.

## 15. In-memory idempotency and audit store — technical debt (Action Runtime-level, not Task's)

Both `createInMemoryIdempotencyStore()` and `createInMemoryAuditStore()` are plain in-process `Map`-backed singletons, instantiated once at module load. Within one warm server process this works correctly (a retried request with the same idempotency key returns the cached result without re-invoking the handler; audit records the real outcome). **Across serverless cold starts / separate instances in the actual Vercel production deployment, neither is guaranteed to survive** — this is a shared characteristic of the whole Action Runtime pattern, identical for `customer.create` today, not something Task introduced or is responsible for fixing. Per the user's explicit instruction, this is **not to be solved within the Task capability** — track separately as Action Runtime-level debt.

## 16. Prisma migrations applied this session

- `20260801150000_add_notification`
- `20260801160000_add_task`

Both applied via an **isolated, non-destructive path** (`prisma migrate diff` → hand-stripped to only the new table's DDL → `prisma db execute --file` → `prisma migrate resolve --applied`), **not** `prisma migrate dev`, because `migrate dev` detected a **pre-existing, unrelated checksum drift** on migration `20260719213000_customer_document_attachments` and offered to reset the entire local dev database ("All data will be lost"). That reset was refused. The underlying drift (an out-of-band `ALTER TABLE` on `BusinessCandidate.entityResolutionStatus` default and a `CustomerDocumentAttachment` primary-key type change, visible in a full `prisma migrate diff`) is **still unresolved and still present** — it predates this session, is unrelated to Notification/Task, and was not touched. `prisma migrate status` currently reports "up to date" (that check doesn't trip on the same drift `migrate dev` does), so this is a **latent risk for the next time anyone runs `migrate dev`**, not an active failure.

## 17. Verification results (as of this report)

- **Typecheck**: clean (`npx tsc --noEmit`).
- **Tests**: 1917 passed, 1 skipped, 0 failed (231 files).
- **Production build**: clean (`npm run build`).
- All three re-run fresh immediately before writing this report.

## 18. First concrete task for the new session

**Mandatory first production verification** (per your instruction): there is user-observed screenshot evidence that **live production still produces an incorrect capability-denial response when creating a new customer** ("yetkim yok" / "bağlantım yok" / benzeri, without a real authorization denial behind it). This was raised in this closing message but the screenshot/details were not shared in this session — **the new session's first step should be to get that evidence from the user and investigate the real cause** (likely somewhere in the policy/permission/capability-resolution chain described in §13, or a stale production deployment not matching what's in this repo). Do not assert a capability denial to the user without verifying a real authorization failure behind it, per the rule below.

After that: resume closing Task's authenticated acceptance (§12) with a real user session, then only after Task is fully `ACCEPTED_LOCAL_AUTHENTICATED` (or `ACCEPTED_PRODUCTION_AUTHENTICATED`) move the same architecture to Takvim, Ekip, and further capabilities.

## 19. Rules to preserve in the new session

**Product model (do not drift from this):**
- METRIX's product is Conversation + one Living Workspace — the Çalışma Masası (Work Desk). Not modules, not pages.
- The user never navigates between modules/pages. The workspace opens only when needed and can be closed when the work is done.
- On desktop, an empty second panel is never permanently visible.
- On mobile, never two narrow columns — chat is full-screen; the work surface opens only as a full-width focus layer when needed.
- The Conversation never unmounts.
- The URL stays `/metrix`.
- The user must be able to create, open, change, close, approve, and commit any record through both written and voice conversation.
- Voice and Text must use the exact same Conversation Understanding, planner, Action Runtime, Living Workspace, and canonical response chain — no second brain, no second planner.
- Voice is not just a speech/navigation channel — it must be able to perform every mutation capability.
- METRIX must never say "yetkim yok" / "bağlantım yok" / "erişimim yok" / "yapamam" without real, proven authorization-denial evidence behind it.
- Notification and Task are not to be marked ACCEPTED until real authenticated acceptance is actually done.
- No second orchestrator, no second runtime, no second response owner, no second navigation authority, no route-centric product model.
- Executive Personality — METRIX's character, tone, Executive Intelligence, and Voice experience — must be preserved exactly.
- New capabilities are built as parts of the one Executive workflow, never as separate modules.

**Operating rules (carried over from this session):**
- Capability status vocabulary: `IMPLEMENTED_PENDING_ACCEPTANCE`, `ACCEPTED_LOCAL_AUTHENTICATED`, `ACCEPTED_PRODUCTION_AUTHENTICATED`, `PARTIAL`, `BLOCKED` — use these, nothing else.
- Every capability report must cover: Conversation, Living Workspace, Draft, Validation, Approval, Action Runtime Gateway, Domain Service, Persistence, Notification, Executive Memory, Reporting, Browser Acceptance, Production Build.
- Risk/approval classification reuses the existing `actionRegistry` + `PolicyEngine` (`riskLevelBase` LOW/MEDIUM/HIGH, `approvalPolicy` NONE/EXPLICIT/CONDITIONAL) — never a second approval engine.
- Never seed a local session, user, or org via a script to fabricate authenticated test evidence — authenticated acceptance requires a real user session, provided by the user.
- Never run `prisma migrate reset` or any destructive migration command without explicit confirmation.
- Never run production-acceptance scripts or anything hitting a real production URL/database without explicit confirmation of what's being targeted.
- Stop only for: irreversible data-loss risk, security risk, a critical production decision, or a genuine unresolved constitutional conflict — otherwise continue without asking for permission between steps.
- Commit locally as work completes; push/deploy only with explicit per-instance approval.

---

## Files the new session needs (exact names)

- `METRIX_SESSION_HANDOFF.md` — this file (repo root, currently **uncommitted**).
- `METRIX_ARCHITECTURE_MATRIX.md` — repo root (committed in `6cde77e`, now stale re: Notification/Task per §8).
- `CLAUDE.md`, `AGENTS.md` — repo root (auto-loaded project instructions, unchanged).
- `src/lib/action-runtime/domains/tasks/task-create-handler.ts` — the reference-implementation handler (side-effect consistency pattern to replicate).
- `src/lib/action-runtime/registry/manifests/tasks.actions.ts` — the risk/approval registration pattern to replicate per new capability.
- `src/lib/tasks/task-create-conversation-coordinator.ts` and `src/lib/tasks/task-create-conversation-planner.ts` — the conversation chain pattern to replicate.
- `src/lib/executive-operating-context/executive-operating-context-builder.service.ts` and `src/lib/domain-evidence/domain-evidence.service.ts` — the reporting-connection pattern to replicate.
- `prisma/schema.prisma` — current canonical data model (Notification, Task added).

This report is not committed. Working tree is otherwise exactly as described in §5.
