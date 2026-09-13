# METRIX Next — Executive Core Reconstruction Design

**Status:** Approved architecture; implementation not started
**Date:** 2026-09-13
**Source audit HEAD:** `53e2edb7d7a5df78f2741a4284c0e592dcb2395c`
**Source repository:** `/Users/mac/Projects/metrix-ai-os`
**New repository:** `/Users/mac/Projects/metrix-next`

## 1. Goal

Build a new, independent METRIX that preserves proven business capabilities while removing the old patch-heavy conversation/orchestration architecture.

The target runtime is:

`USER ↔ GPT-Live-1 (METRIX) → native delegation when needed → GPT-5.6 Sol → typed capability/tool → deterministic runtime → verified real result → same METRIX conversation`

The new product must be fast, simple, maintainable, conversation-first, and able to perform real business work without duplicate semantic owners.

## 2. Non-negotiable isolation rule

No production feature in `metrix-next` may require `metrix-ai-os` to be running.

The old repository is a read-only source and parts warehouse. Reuse means selective migration into the new repository, never runtime linking.

Forbidden production dependencies include:

- imports from the old repository,
- HTTP calls to an old METRIX runtime,
- shared in-process services from the old runtime,
- compatibility bridges whose purpose is to keep old semantic/orchestration code alive.

## 3. Frozen architecture

METRIX Next has nine major runtime parts:

1. Live Executive Surface
2. Sol Executive Reasoning
3. Company Reality
4. Organizational Identity / Roles / Permissions
5. Memory
6. Typed Capabilities + Deterministic Action Runtime
7. Integrations / Connectors
8. Events / Notifications / Watch
9. Artifacts / Reporting

Cross-cutting deterministic invariants:

- authentication,
- tenant isolation,
- authorization,
- approval,
- idempotency,
- persistence,
- audit/outbox,
- verification/readback.

Core invariant:

> LLM karar verebilir; gerçeklik ilan edemez. Runtime gerçeği değiştirir ve doğrular.

A model may propose or request an action. Only deterministic runtime execution plus verification/readback may establish completion.

## 4. Semantic ownership

### GPT-Live-1

GPT-Live-1 is the sole live conversational owner. It handles natural turn-taking, fast/routine conversation, interruption, barge-in, and user-facing delivery.

It is not a second General Manager. It must not invent deep executive judgments that belong to Sol.

### GPT-5.6 Sol

Sol owns delegated executive reasoning: root cause, prioritization, strategic alternatives, incentives, second/third-order effects, and critical management judgment.

Sol returns a concise spoken executive handoff intended to fit naturally back into the same Live conversation.

### No other semantic owner

There will be no custom classifier/router/planner/narration stack that independently reinterprets the same user request when native model/tool selection can do the job.

## 5. What migrates from the old repository

### Port the deterministic Action Runtime core

Migrate the minimal execution engine and contracts needed for:

- action registry,
- input validation,
- permission/risk/policy evaluation,
- approval,
- durable idempotency,
- handler execution,
- audit,
- outbox/events,
- operation lifecycle,
- typed execution results.

Do not migrate every domain handler in Phase 1. Domain handlers are added only when a vertical slice needs them.

Any `executive-lifecycle` dependency pulled into the Action Runtime must be audited. Pure deterministic lifecycle contracts may be renamed/moved into Action Runtime; semantic executive logic must be removed from the dependency chain.

### Port + simplify

Candidates to port selectively and simplify:

- auth/session/organization context,
- tenant isolation and role/permission primitives,
- Company Reality data/source identity primitives,
- memory candidate/promotion concepts,
- notification repository/fanout primitives,
- Living Workspace contracts and later approved UI components.

### Port as independent capabilities

Reusable independent runtimes/adapters may be migrated behind clean interfaces:

- BizimHesap,
- Gmail,
- Google Calendar,
- iCloud Calendar,
- integration secret encryption,
- XLSX/DOCX/PDF/PPTX artifact renderers,
- approved transactional email provider.

## 6. What does not migrate

Do not port the old conversation/executive orchestration architecture as a runtime dependency, including:

- `/api/ai/chat/route.ts`,
- old AI gateway orchestration,
- prompt registry/rendering mega-stack,
- conversation-understanding classifier stack,
- executive brain stack,
- executive conversation engine,
- executive request resolution,
- executive orchestration planner,
- manager-advice narration pipeline,
- duplicate/progressive narration owners,
- compatibility bridges whose only purpose is to preserve those layers.

Old files may be read as historical reference while implementing equivalent product behavior with the new architecture.

## 7. Company Reality boundary

Company Reality is the authoritative company-state access layer above systems of record.

It must be:

- source-aware,
- current,
- event-updated,
- integration-backed,
- tenant-scoped,
- epistemically explicit.

It does not perform executive reasoning. It exposes typed current facts and provenance to Live/Sol/tools.

External intelligence and web evidence remain source-tagged evidence and must not silently overwrite authoritative business truth.

## 8. Connector boundary

Every external system uses a typed connector interface. Vendor-specific adapters implement that interface.

The first real accounting/ERP lab is BizimHesap, while the product remains vendor-neutral so future Logo, Mikro, Paraşüt, HubSpot, Salesforce, Gmail, Calendar, banking and communication connectors can be added without changing Executive Core semantics.

Bidirectional synchronization must use external identity, source ownership and idempotency to prevent echo loops and duplicate records.

## 9. Client independence

Business logic must not live in the web UI.

Web/PWA/native clients consume the same backend capabilities so a future iOS/Android app can provide the same METRIX brain, actions, notifications and Company Reality.

Living Workspace is a visual work surface opened by METRIX when the task benefits from visual interaction. It is not a competing menu-first operating model.

## 10. Phase 1 — Core bootstrap vertical slice

Phase 1 intentionally proves the new architecture with a narrow but real slice.

### Read path

`Text user → METRIX Executive Agent → typed customer lookup → Company Reality → grounded answer`

### Mutation path

`User task request → METRIX → task.create typed action → authorization → idempotency → real DB mutation → independent readback → verified typed result → METRIX completion message`

Task is chosen because it proves real mutation, organization isolation, temporal argument resolution, Action Runtime, and readback without introducing money-movement approval complexity.

### Phase 1 explicitly excludes

- native Live voice implementation,
- BizimHesap production synchronization,
- full Living Workspace migration,
- Always-On Watch,
- 07:00 intelligence scan,
- broad domain migration,
- bulk migration of the old Prisma schema,
- complete artifact suite integration.

These follow only after the core slice passes acceptance.

## 11. Phase 1 acceptance criteria

Phase 1 is accepted only when all of the following are proven by execution, not assertion:

1. `metrix-next` runs independently.
2. Runtime dependency on `metrix-ai-os` is zero.
3. A simple user request does not traverse a custom classifier/router/planner chain.
4. The Executive Agent can select a typed tool/capability.
5. `task.create` creates a real database record.
6. Authorization is enforced server-side.
7. Tenant isolation is enforced.
8. Idempotency is durable and proven with a repeated request.
9. Independent readback verifies the persisted task.
10. No model can claim completion before verified execution result exists.
11. Text hot path has one semantic owner.
12. Type checking, automated tests and production build pass.

No second business domain is migrated before these criteria pass.

## 12. Data strategy for Phase 1

Do not copy the 131-model legacy Prisma schema wholesale.

Start with the minimum identity/runtime/task schema required by Phase 1, derived from proven legacy models and contracts.

Development/staging data must be isolated from current production data. Production credentials or mutation access are not introduced until the new deterministic runtime and readback path have passed acceptance in an isolated environment.

## 13. Error and truth handling

All tool/action failures are typed. The conversational layer receives a verified result such as success, approval-required, permission-denied, validation-failed, execution-failed or verification-failed.

A successful handler call alone is insufficient if readback is required and fails.

User-facing language must reflect the verified state. There are no fabricated interim success messages.

## 14. Testing strategy

Phase 1 uses contract/unit/integration tests around each boundary:

- Executive Agent tool selection contract,
- Company Reality customer lookup,
- action input validation,
- permission and tenant isolation,
- durable idempotency,
- task handler persistence,
- independent readback,
- completion-truth contract,
- old-repo runtime isolation guard.

Final acceptance also requires a real local end-to-end run in an isolated environment.

## 15. Implementation discipline

- Prefer native OpenAI Agents/Realtime capabilities over custom semantic orchestration.
- Add custom code only for business truth, deterministic safety, integrations, persistence, product UI or other responsibilities the native model/runtime cannot safely own.
- Stop and redesign if implementation begins recreating classifier/router/planner/narration layers.
- Do not declare a phase complete without execution and readback evidence.
- Commit and push are separate authorization boundaries; no push or deploy occurs without explicit approval.
