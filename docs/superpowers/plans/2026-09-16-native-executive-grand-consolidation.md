# METRIX Native Executive Grand Consolidation Implementation Plan

**Goal:** Replace Workspace-led presentation with one canonical Executive turn/result spine, generic views, calendar, documents, approvals, notifications, and a minimal Live protocol bridge.

**Architecture:** GPT-5.6 Sol remains the sole Executive and invokes existing deterministic canonical tools. Every transport produces the same durable `TurnResult`; deterministic projection creates generic views and artifacts. GPT-Live-1 remains direct WebRTC conversational audio, with only the protocol-required trusted sideband bridge.

**Global constraints:** Preserve existing truth and dirty Reality Gate work; no commit/push/deploy; no parallel permanent Workspace path; no second Executive, classifier, router, planner, STT/TTS replacement, or Live runtime replacement.

### Task 1: Canonical result spine

Create presentation and turn-result contracts; replace Workspace-specific tool-call capture with canonical result collection. Add contract tests before implementation.

### Task 2: Text reference path

Make `runMetrixExecutiveTurn` and `/api/metrix` produce one durable canonical `TurnResult`, preserving the native Agents SDK run/session/tool loop. Add API and Executive tests first.

### Task 3: Deterministic generic presentation

Create deterministic List, Entity, Metrics, Chart, Calendar, and Document projections and one generic React surface. Remove text dependence on `WorkspaceDirective` with projection and renderer tests.

### Task 4: Calendar truth and capability

Add forward-safe organization/user scoped CalendarEvent persistence, typed read/create/update tools, verification/readback, and a month/week/day generic Calendar view. Add migration and action tests first.

### Task 5: Artifact/document system

Add versioned artifact/document persistence, typed source snapshots, deterministic HTML/preview renderers, document capability/tool contracts, and generic Document view. Keep external delivery behind durable approval.

### Task 6: Approval and notification capabilities

Add durable generic approvals and notifications with tenant/actor scope, idempotency, auditability, and generic UI surfaces. Test authorization, expiry/status, and one-time execution.

### Task 7: Main UI consolidation

Replace Workspace context/host/domain navigation with contextual generic result views, document surface, calendar, approval, and notifications. Remove Workspace CSS/runtime only after result delivery parity is present.

### Task 8: Live protocol reduction and evidence

Move presentation delivery out of the Live bridge; retain only function-output/continuation protocol behavior. Diagnose and correct the continuation protocol only from observed wire evidence and a failing regression test. Do not add retry/queue/router state.

### Task 9: Workspace retirement and safe schema cleanup

Delete dead Workspace modules/routes/tests and retire directive persistence only after generic result delivery is proven. Preserve Live session bindings and Company Truth records.

### Task 10: Verification and physical Reality Gate

Run focused and full tests, typecheck, build, migration validation, diff check, then hand off one physical-mic utterance at a time. Require three consecutive complete real runs before completion.
