# METRIX Executive Agent Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the first real METRIX Executive Agent to the existing verified `task.create` business action without introducing a custom classifier, router, planner, or second semantic owner.

**Architecture:** `/api/metrix` receives an authenticated actor/company context plus the user message and hands the turn directly to one OpenAI Agents SDK `Agent`. The agent receives native function tools. The first mutation tool is `task.create`, whose implementation delegates to the already-proven deterministic `executeTaskCreate()` runtime. Only the deterministic runtime may authorize, mutate, enforce idempotency, read back, and declare `VERIFIED`.

**Tech Stack:** Node.js 22.23.2, Next.js 15.5.19, TypeScript 5.9, OpenAI Agents SDK 0.17.2, OpenAI 7.15.0, Zod 4.5.4, Prisma 7.10.0, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-metrix-next-core-design.md`

## Global Constraints

- New runtime must not depend on `/Users/mac/Projects/metrix-ai-os`.
- One semantic owner: METRIX Executive Agent.
- No custom intent classifier, semantic router, planner, narration layer, or duplicate executive cognition.
- Native Agents SDK tool selection is the only semantic tool-routing mechanism.
- LLM may decide; it may not declare business reality.
- `task.create` completion exists only after authorization, durable idempotency, DB mutation, independent readback, and `VERIFIED`.
- Existing deterministic action runtime remains authoritative.
- Phase 1 stays text-only; GPT-Live is not part of this task.
- No production deploy or push.

---

### Task 1: Expose `task.create` as a native Agents SDK function tool

**Files:**
- Create: `src/lib/agent/tools/task-create-tool.ts`
- Test: `tests/agent/task-create-tool.test.ts`

**Interfaces:**
- Consumes: `executeTaskCreate(input: TaskCreateInput): Promise<VerifiedTaskCreateResult>`
- Produces: `createTaskCreateTool(context: ExecutiveToolContext)`
- `ExecutiveToolContext` contains `actorUserId` and `organizationId`.
- Tool-visible arguments contain only natural business fields: `title`, optional `priority`, optional `dueAt`, and `idempotencyKey`.
- Actor/company identity is injected by trusted server context and is never model-selectable.

- [ ] **Step 1: Write failing tool test**
  - Assert tool module exists.
  - Execute the tool through its function handler with a real authorized test user and organization.
  - Assert returned result has `action: "task.create"`, `verified: true`, `status: "VERIFIED"`.
  - Assert persisted task belongs to the server-injected organization.
  - Assert model arguments cannot override actor/company identity.

- [ ] **Step 2: Verify RED**
  - Run `npm test -- tests/agent/task-create-tool.test.ts`.
  - Expected failure: tool module is missing.

- [ ] **Step 3: Implement the minimal native tool**
  - Use Agents SDK `tool()`.
  - Use Zod schema for tool arguments.
  - Call only `executeTaskCreate()`.
  - Do not replicate authorization, mutation, idempotency, or verification in the tool wrapper.
  - Return the deterministic verified result unchanged.

- [ ] **Step 4: Verify GREEN**
  - Run the tool test and existing action tests.
  - All must pass.

---

### Task 2: Create the single METRIX Executive Agent

**Files:**
- Create: `src/lib/agent/metrix-executive-agent.ts`
- Create: `src/lib/agent/types.ts`
- Test: `tests/agent/metrix-executive-agent.test.ts`

**Interfaces:**
- Produces: `runMetrixExecutiveTurn(input)`
- Input:
  - `actorUserId: string`
  - `organizationId: string`
  - `message: string`
  - `turnId: string`
- Output:
  - final natural-language agent response
  - tool execution evidence for server-side verification/testing
- Uses one `Agent`.
- Agent name: `METRIX`.
- Agent instructions explicitly forbid claiming completion unless a tool returned a verified result.

- [ ] **Step 1: Write failing agent construction test**
  - Assert the executive module exists.
  - Assert exactly one METRIX agent is constructed.
  - Assert the native `task.create` tool is attached.
  - Assert source contains no custom classifier/router/planner.

- [ ] **Step 2: Verify RED**
  - Run `npm test -- tests/agent/metrix-executive-agent.test.ts`.
  - Expected failure: executive agent module missing.

- [ ] **Step 3: Implement minimal executive agent**
  - Use `Agent` and `run` from `@openai/agents`.
  - Attach only the approved Phase 1 tools.
  - Keep instructions short and authority-specific.
  - No second LLM call, narrator, planner, or response-rewriter.

- [ ] **Step 4: Verify GREEN**
  - Run executive-agent tests and full suite.

---

### Task 3: Replace the placeholder `/api/metrix` route with the Executive Agent entrypoint

**Files:**
- Modify: `src/app/api/metrix/route.ts`
- Test: `tests/api/metrix-route.test.ts`

**Interfaces:**
- POST JSON body:
  - `message: string`
  - `actorUserId: string`
  - `organizationId: string`
  - `turnId: string`
- Route delegates directly to `runMetrixExecutiveTurn`.
- Route performs transport validation only.
- Route does not classify, plan, select tools, mutate business state, or narrate results independently.

- [ ] **Step 1: Write failing route contract test**
  - Valid request no longer returns `501 EXECUTIVE_NOT_WIRED`.
  - Invalid transport input returns a deterministic 400-level validation response.
  - Source scan confirms no classifier/router/planner implementation in route.

- [ ] **Step 2: Verify RED**
  - Run route test and confirm current placeholder behavior fails the new contract.

- [ ] **Step 3: Implement direct delegation**
  - Parse transport input with Zod.
  - Call `runMetrixExecutiveTurn`.
  - Return its final answer and execution metadata.
  - Do not add semantic middleware.

- [ ] **Step 4: Verify GREEN**
  - Run route contract tests and full suite.

---

### Task 4: Prove the Phase 1 Executive mutation path

**Files:**
- Create: `tests/acceptance/executive-task-create.test.ts`

**Interfaces:**
- Full path under test:
  - user message
  - single Executive Agent
  - native Agents SDK tool selection
  - `task.create`
  - organization authorization
  - durable idempotency
  - real PostgreSQL mutation
  - independent readback
  - `VERIFIED`
  - natural completion response

- [ ] **Step 1: Add acceptance test**
  - Seed organization, authorized user, and membership.
  - Submit a natural Turkish request equivalent to “Belgin tahsilatını yarın kontrol et diye yüksek öncelikli görev oluştur.”
  - Verify one task is persisted for the correct organization.
  - Verify one `ActionExecution` exists and is `VERIFIED`.
  - Verify the same idempotency identity cannot create a duplicate.
  - Verify unauthorized actor cannot create the task.
  - Verify no completion evidence exists before verified action result.

- [ ] **Step 2: Run acceptance test**
  - If external model credentials are unavailable, fail explicitly rather than mocking semantic tool selection.
  - Do not convert this acceptance proof into a mocked model test.

- [ ] **Step 3: Run full verification**
  - `npx prisma validate`
  - `npx prisma migrate status`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `git diff --check`

- [ ] **Step 4: Architecture guards**
  - No runtime reference to old METRIX.
  - No classifier/router/planner/narrator semantic ownership.
  - `.env` remains ignored.
  - Old repo HEAD unchanged.

- [ ] **Step 5: Commit**
  - Commit only after all deterministic tests pass.
  - Live model acceptance evidence is reported separately and must not be overstated if credentials or network prevent execution.
