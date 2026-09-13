# METRIX Production Live Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the accepted browser voice experience into METRIX NEXT: authenticated direct-WebRTC GPT-Live-1, native Responses delegation to GPT-5.6 Sol, canonical verified business actions, and same-session delivery by one METRIX.

**Architecture:** The browser owns microphone capture, the `RTCPeerConnection`, and remote audio playback only. It sends its SDP offer to an authenticated METRIX endpoint; the endpoint creates `gpt-live-1`, attaches a server-only sideband, and returns only the SDP answer and safe presentation data. GPT-Live-1 remains the sole conversational owner; its native Responses delegation uses `gpt-5.6-sol`, whose function calls are executed by a server-side adapter over the existing canonical actions and whose verified results are continued on the same Live session.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Vitest 3, Prisma 7/PostgreSQL, `openai@7.15.0` Live API and `SidebandWS`, existing `@openai/agents@0.17.2` for temporary text compatibility.

**Spec:** `docs/superpowers/specs/2026-09-13-metrix-live-sol-production-architecture.md`

## Global Constraints

- One METRIX: GPT-Live-1 is the only user-facing conversation and voice owner; GPT-5.6 Sol is delegated executive reasoning, never a second persona.
- Use direct browser-to-OpenAI WebRTC and the authenticated server sideband for trusted control. Do not add an audio relay, custom STT, or custom TTS.
- Use `gpt-live-1` and native `delegation.type: "responses"` with backend model `gpt-5.6-sol`; do not add a classifier, semantic router, planner, narration layer, or second agent.
- Continue to use the existing canonical `task_create`, `customer_create`, and `customer_lookup` action/runtime implementations. Do not make voice-specific actions.
- Derive actor, organization, permissions, trusted clock, and idempotency material on the server. The browser never asserts them and never receives `OPENAI_API_KEY`, database credentials, or privileged business authority.
- Report a mutation as complete only after `ActionExecution.status === "VERIFIED"` and deterministic DB readback succeeds.
- Preserve the accepted immediate natural acknowledgement. Do not introduce a timer-driven second three-to-four-second backchannel or a workaround speaker.
- Keep the first browser surface to start/stop, microphone state, connection state, remote playback, and recoverable errors. Do not add voice personalization UI or unrelated product work.
- Add no package. `openai@7.15.0` already declares `client.live.create` and `SidebandWS`; `@openai/agents-realtime` is neither installed nor needed for the chosen direct SDK path.
- Every deterministic change follows RED → GREEN → REFACTOR. Automated tests do not claim to prove microphone hardware, audible playback, WebRTC media, or barge-in; these remain real-browser acceptance gates.

## Repository Reality and Migration Decision

`src/app/api/metrix/route.ts` currently authenticates the `metrix_session` cookie and invokes `runMetrixExecutiveTurn`. That call constructs one `@openai/agents` Sol agent from `src/lib/agent/metrix-executive-agent.ts`; its three tool wrappers already call `executeTaskCreate`, `executeCustomerCreate`, and `lookupCustomersForOrganization`. The action layer authorizes organization access, creates an `ActionExecution`, and readbacks before returning `VERIFIED`.

The implementation keeps `/api/metrix` as a compatibility/fallback transport during migration, but changes it to consume the same METRIX backend prompt and the same framework-neutral tool catalog used by Live. It is not a second semantic owner. The Live path is the canonical user-facing METRIX path where supported; removal of the text fallback is outside this increment and must be a separately accepted migration decision after voice production acceptance.

The disposable `/tmp/metrix-browser-voice-proof` contributes only three reusable concepts: browser-created SDP, direct WebRTC remote audio, and server-side `live.create` plus `SidebandWS`. Its hard-coded localhost origin, process-local `Map`, voice dropdown/catalog, verbose event log, manual VAD metrics panel, absolute `node_modules` imports, and test prompt are proof-only instrumentation and must not be copied into production.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/lib/agent/metrix-executive-contract.ts` | Single Sol backend instructions and deterministic-result language shared by text and Live. |
| `src/lib/agent/tools/metrix-business-tool-runtime.ts` | Single Zod-backed function catalog and server dispatcher to existing actions/lookup. |
| `src/lib/agent/tools/*.ts` | Existing Agents SDK wrappers changed to call the shared dispatcher rather than own action wiring. |
| `src/lib/live/types.ts` | Server-only Live session, function-call, lifecycle, and safe-browser-response types. |
| `src/lib/live/live-session-config.ts` | Pure GPT-Live-1/Responses configuration and restricted client data-channel policy. |
| `src/lib/live/live-session-service.ts` | Authenticated bootstrap, DB session binding, OpenAI `live.create`, and cleanup state transitions. |
| `src/lib/live/live-sideband-service.ts` | Same-session `SidebandWS` lifecycle, nested Responses event handling, function continuation, and safe lifecycle events. |
| `src/lib/live/live-observability.ts` | Structured, payload-minimized lifecycle timing emission. |
| `src/app/api/metrix/live/session/route.ts` | Authenticated SDP bootstrap endpoint; no privileged browser inputs. |
| `src/app/api/metrix/live/session/[sessionId]/close/route.ts` | Authenticated best-effort close endpoint that cannot execute tools. |
| `src/app/voice/page.tsx` | Minimal production voice entry surface. |
| `src/app/voice/voice-session-client.tsx` | Client-only microphone, WebRTC, data-channel, remote audio, and recovery UI. |
| `src/app/voice/voice-session-client-state.ts` | Pure client connection state reducer, independently testable without a microphone. |
| `prisma/schema.prisma` and one new Prisma migration | Durable server binding between an authenticated actor/org and an OpenAI Live session; no transcript or secret storage. |

## Implementation Tasks

### Task 1: Establish the shared METRIX backend contract

**Purpose:** Make the existing text fallback and the future Live Responses backend consume one authoritative Sol prompt and one verified-completion policy.

**Files:**

- Create: `src/lib/agent/metrix-executive-contract.ts`
- Modify: `src/lib/agent/metrix-executive-agent.ts`
- Modify: `tests/agent/metrix-executive-agent.test.ts`
- Create: `tests/agent/metrix-executive-contract.test.ts`

**Interfaces:**

- Produces `METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS: string`.
- Produces `buildMetrixExecutiveBackendInstructions(input: { timezone: string; referenceTimeIso: string }): string`.
- `createMetrixExecutiveAgent` consumes `buildMetrixExecutiveBackendInstructions` and remains the temporary text compatibility entrypoint.

- [ ] **Step 1: Write the failing contract tests.**

```ts
expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("VERIFIED");
expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("Actor, organization");
expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("Do not claim");
expect(buildMetrixExecutiveBackendInstructions({
  timezone: "Europe/Istanbul",
  referenceTimeIso: "2026-09-13T17:30:00.000Z"
})).toContain("2026-09-13T17:30:00.000Z");
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/agent/metrix-executive-contract.test.ts`

Expected RED reason: module `metrix-executive-contract` does not exist.

- [ ] **Step 3: Implement the minimal shared contract.** Extract the existing Turkish METRIX business/verification instructions verbatim in meaning into `METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS`; append only trusted time context in `buildMetrixExecutiveBackendInstructions`. Replace the local instruction constant in `metrix-executive-agent.ts` with this builder. Keep `model: "gpt-5.6-sol"` and exactly one `new Agent`.

- [ ] **Step 4: Verify GREEN and regressions.**

Run: `npx vitest run tests/agent/metrix-executive-contract.test.ts tests/agent/metrix-executive-agent.test.ts tests/agent/temporal-context.test.ts`

Expected GREEN: shared prompt exists, text agent still has one METRIX and one Sol model construction, trusted temporal instructions remain present.

- [ ] **Step 5: Commit boundary.**

```bash
git add src/lib/agent/metrix-executive-contract.ts src/lib/agent/metrix-executive-agent.ts tests/agent/metrix-executive-contract.test.ts tests/agent/metrix-executive-agent.test.ts
git commit -m "refactor: share METRIX executive backend contract"
```

### Task 2: Centralize canonical business function contracts and dispatch

**Purpose:** Expose exactly the current three capabilities to both the existing Agents SDK fallback and Live Responses function calling without duplicating action execution.

**Files:**

- Create: `src/lib/agent/tools/metrix-business-tool-runtime.ts`
- Modify: `src/lib/agent/tools/task-create-tool.ts`
- Modify: `src/lib/agent/tools/customer-create-tool.ts`
- Modify: `src/lib/agent/tools/customer-lookup-tool.ts`
- Modify: `src/lib/agent/types.ts`
- Create: `tests/agent/metrix-business-tool-runtime.test.ts`
- Modify: `tests/agent/task-create-tool.test.ts`
- Modify: `tests/agent/customer-create-tool.test.ts`
- Modify: `tests/agent/customer-lookup-tool.test.ts`

**Interfaces:**

- Produces `MetrixTrustedToolContext = { actorUserId: string; organizationId: string; idempotencyScope: string; timezone: string; referenceTimeIso: string }`.
- Produces `METRIX_RESPONSES_FUNCTION_TOOLS`, an OpenAI Responses-compatible array containing exactly `task_create`, `customer_create`, and `customer_lookup` with model-controlled business arguments only.
- Produces `executeMetrixBusinessTool(input: { name: "task_create" | "customer_create" | "customer_lookup"; argumentsJson: string; context: MetrixTrustedToolContext }): Promise<unknown>`.
- Existing Agents SDK wrappers consume this dispatcher with `idempotencyScope: "turn:" + turnId`; Live will consume it with a server-generated function-call scope.

- [ ] **Step 1: Write the failing shared-runtime tests.**

```ts
expect(METRIX_RESPONSES_FUNCTION_TOOLS.map((tool) => tool.name)).toEqual([
  "task_create", "customer_create", "customer_lookup"
]);
expect(JSON.stringify(METRIX_RESPONSES_FUNCTION_TOOLS)).not.toMatch(
  /actorUserId|organizationId|idempotencyKey|referenceTimeIso/
);
await expect(executeMetrixBusinessTool({
  name: "task_create",
  argumentsJson: JSON.stringify({ title: "Tahsilatı kontrol et", priority: "HIGH" }),
  context
})).resolves.toMatchObject({ status: "VERIFIED", verified: true });
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/agent/metrix-business-tool-runtime.test.ts`

Expected RED reason: shared runtime module and exported function catalog do not exist.

- [ ] **Step 3: Implement the minimal dispatcher.** Define the three existing Zod input schemas once. Dispatch `task_create` to `executeTaskCreate`, `customer_create` to `executeCustomerCreate`, and `customer_lookup` to `lookupCustomersForOrganization`. Build mutation idempotency keys as `${context.idempotencyScope}:task.create` and `${context.idempotencyScope}:customer.create`; do not accept those fields from arguments. Convert the Zod schemas to the JSON schema required by the Live function definitions. Change each existing Agents SDK wrapper to parse through this same dispatcher and retain only the `RunContext` bridge.

- [ ] **Step 4: Verify GREEN and regression behavior.**

Run: `npx vitest run tests/agent/metrix-business-tool-runtime.test.ts tests/agent/task-create-tool.test.ts tests/agent/customer-create-tool.test.ts tests/agent/customer-lookup-tool.test.ts tests/actions/task-create.test.ts tests/actions/customer-create.test.ts tests/data/customer-lookup.test.ts`

Expected GREEN: one canonical dispatcher reaches the unchanged action/data layer; existing idempotency, authorization, tenant isolation, and readback tests remain green.

- [ ] **Step 5: Refactor only duplication revealed by the tests.** Keep each wrapper file as a thin SDK adapter; do not move persistence, permissions, or action logic into `src/lib/agent`.

- [ ] **Step 6: Commit boundary.**

```bash
git add src/lib/agent/tools src/lib/agent/types.ts tests/agent tests/actions tests/data
git commit -m "refactor: share canonical METRIX business tool runtime"
```

### Task 3: Persist the trusted Live-session binding

**Purpose:** Give server-side sideband and function execution a durable, authenticated session record without storing raw transcripts, API keys, or business payloads.

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260913190000_add_live_session_binding/migration.sql`
- Create: `src/lib/live/types.ts`
- Create: `src/lib/live/live-session-store.ts`
- Create: `tests/live/live-session-store.test.ts`

**Interfaces:**

- Produces Prisma model `LiveSession` with `id`, `openAiSessionId` (unique), `userId`, `organizationId`, `status`, `createdAt`, `connectedAt`, `sidebandAttachedAt`, `endedAt`, and `failureCode`.
- Produces `createLiveSessionBinding(input: { actorUserId: string; organizationId: string }): Promise<LiveSessionBinding>`.
- Produces `bindOpenAiLiveSession(input: { bindingId: string; openAiSessionId: string }): Promise<LiveSessionBinding>`.
- Produces `loadLiveSessionBinding(input: { bindingId: string; actorUserId: string; organizationId: string }): Promise<LiveSessionBinding>`.
- `LiveSessionBinding` exposes trusted context but no client credential.

- [ ] **Step 1: Write failing persistence tests.**

```ts
const binding = await createLiveSessionBinding({ actorUserId, organizationId });
await bindOpenAiLiveSession({ bindingId: binding.id, openAiSessionId: "live_test_1" });
await expect(loadLiveSessionBinding({ bindingId: binding.id, actorUserId: outsiderId, organizationId }))
  .rejects.toMatchObject({ code: "LIVE_SESSION_ACCESS_DENIED" });
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/live/live-session-store.test.ts`

Expected RED reason: the `LiveSession` client model and store do not exist.

- [ ] **Step 3: Implement schema and store.** Add only the binding columns above and foreign keys to `User` and `Organization`; generate and apply a migration in the implementation environment. Define lifecycle statuses `BOOTSTRAPPING`, `CONNECTED`, `DISCONNECTED`, `CLOSED`, and `FAILED`. `loadLiveSessionBinding` must check the authenticated actor and organization against the stored binding, not browser fields.

- [ ] **Step 4: Verify GREEN and database regressions.**

Run: `npx prisma validate && npx vitest run tests/live/live-session-store.test.ts tests/auth/executive-session-context.test.ts tests/auth/organization-access.test.ts tests/data/tenant-isolation.test.ts`

Expected GREEN: a binding is tenant-scoped and replay-safe to load; existing auth and tenant rules remain unchanged.

- [ ] **Step 5: Commit boundary.**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/live/types.ts src/lib/live/live-session-store.ts tests/live/live-session-store.test.ts
git commit -m "feat: persist trusted Live session bindings"
```

### Task 4: Build the pure Live configuration and authenticated bootstrap service

**Purpose:** Create one server-owned `gpt-live-1` session with `gpt-5.6-sol` native Responses delegation and a browser-restricted data channel.

**Files:**

- Create: `src/lib/live/live-session-config.ts`
- Create: `src/lib/live/live-session-service.ts`
- Create: `tests/live/live-session-config.test.ts`
- Create: `tests/live/live-session-service.test.ts`

**Interfaces:**

- Produces `buildLiveSessionConfig(input: { timezone: string; referenceTimeIso: string; voice: "marin" }): Live.MediaSessionConfig`.
- Produces `bootstrapLiveSession(input: { sdp: string; auth: AuthenticatedExecutiveContext }): Promise<{ bindingId: string; answerSdp: string; voice: "marin" }>`.
- The configured `delegation.responses` uses `model: "gpt-5.6-sol"`, the shared backend instructions, `tool_choice: "auto"`, and `METRIX_RESPONSES_FUNCTION_TOOLS`.
- The data-channel allowlist admits only browser-safe session close and client-visible lifecycle/transcript events; it does not allow browser function results, `response.create`, sideband commands, instructions, or trusted-context updates.

- [ ] **Step 1: Write failing configuration and service tests.**

```ts
const config = buildLiveSessionConfig({ timezone: "Europe/Istanbul", referenceTimeIso, voice: "marin" });
expect(config.model).toBe("gpt-live-1");
expect(config.delegation).toMatchObject({ type: "responses", responses: { model: "gpt-5.6-sol", tool_choice: "auto" } });
expect(JSON.stringify(config.client)).not.toContain("response.item.create");
await expect(bootstrapLiveSession({ sdp: "", auth })).rejects.toMatchObject({ code: "INVALID_SDP" });
```

- [ ] **Step 2: Run the tests and confirm RED.**

Run: `npx vitest run tests/live/live-session-config.test.ts tests/live/live-session-service.test.ts`

Expected RED reason: Live config and bootstrap service exports do not exist.

- [ ] **Step 3: Implement the minimal server-only service.** Instantiate `OpenAI` only in server modules. Validate an SDP offer with a strict bounded schema. Create the DB binding before `client.live.create`; on successful creation persist the opaque OpenAI session ID and return only `bindingId`, SDP answer, and `marin`. On creation failure mark the binding `FAILED` with a stable non-secret code and return no answer. Do not return OpenAI session IDs, keys, actor IDs, organization IDs, tools, or trusted context to the browser.

- [ ] **Step 4: Verify GREEN and dependency assertion.**

Run: `npx vitest run tests/live/live-session-config.test.ts tests/live/live-session-service.test.ts && npm run typecheck`

Expected GREEN: the exact supported installed SDK path compiles; no package file changes are needed.

- [ ] **Step 5: Commit boundary.**

```bash
git add src/lib/live/live-session-config.ts src/lib/live/live-session-service.ts tests/live/live-session-config.test.ts tests/live/live-session-service.test.ts
git commit -m "feat: bootstrap authenticated Live sessions"
```

### Task 5: Expose the authenticated browser SDP endpoint

**Purpose:** Make the bootstrap service available to a browser without granting it business authority or an OpenAI credential.

**Files:**

- Create: `src/app/api/metrix/live/session/route.ts`
- Create: `tests/api/metrix-live-session-route.test.ts`

**Interfaces:**

- Consumes `resolveAuthenticatedExecutiveContext(request)` and `bootstrapLiveSession`.
- Accepts exactly `{ sdp: string }` from the authenticated same-origin browser.
- Produces status `201` and `{ bindingId: string; answerSdp: string; voice: "marin" }`; error bodies contain only stable public codes.

- [ ] **Step 1: Write failing route tests.**

```ts
expect(response.status).toBe(401);
expect(await response.json()).toEqual({ ok: false, code: "UNAUTHENTICATED" });
expect(mockBootstrap).toHaveBeenCalledWith({ sdp: "offer", auth: trustedAuth });
expect(JSON.stringify(await successful.json())).not.toMatch(/OPENAI_API_KEY|actorUserId|organizationId|openAiSessionId/);
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/api/metrix-live-session-route.test.ts`

Expected RED reason: the Live session route does not exist.

- [ ] **Step 3: Implement the route.** Use a strict Zod body schema; reject invalid JSON, extra client identity fields, missing cookie authentication, malformed SDP, and bootstrap failure with explicit non-secret codes. Resolve authentication before bootstrap. Set `Cache-Control: no-store`. Do not create a client secret endpoint and do not proxy browser audio.

- [ ] **Step 4: Verify GREEN and API regression.**

Run: `npx vitest run tests/api/metrix-live-session-route.test.ts tests/api/metrix-route.test.ts tests/auth/executive-session-context.test.ts`

Expected GREEN: the new route accepts only authenticated SDP and the existing text compatibility route keeps its existing trust boundary.

- [ ] **Step 5: Commit boundary.**

```bash
git add src/app/api/metrix/live/session/route.ts tests/api/metrix-live-session-route.test.ts
git commit -m "feat: add authenticated Live WebRTC bootstrap endpoint"
```

### Task 6: Attach and operate the same-session trusted sideband

**Purpose:** Attach `SidebandWS` to the server-created Live session, observe lifecycle safely, and run the native Responses function-result protocol.

**Files:**

- Create: `src/lib/live/live-sideband-service.ts`
- Create: `src/lib/live/live-observability.ts`
- Create: `tests/live/live-sideband-service.test.ts`
- Create: `tests/live/live-observability.test.ts`

**Interfaces:**

- Produces `attachLiveSideband(input: { binding: LiveSessionBinding }): LiveSidebandHandle`.
- `LiveSidebandHandle` exposes `close(): void` and no browser-facing send capability.
- Consumes nested `response.event` envelopes and yields `response.output_item.done` function calls as `{ responseId: string; callId: string; name: string; argumentsJson: string }`.
- Executes each call with `executeMetrixBusinessTool`, using `idempotencyScope: "live:" + binding.id + ":call:" + callId`.
- Sends one `response.item.create` `function_call_output` for each collected call, then one `response.create` only after all required calls have results.
- Emits `recordLiveLifecycle(event)` with IDs, phase, status, and timestamps only; it never records credentials, SDP, raw transcript, tool arguments, or tool result payloads.

- [ ] **Step 1: Write failing sideband lifecycle tests with a fake sideband transport.**

```ts
await service.handle({ type: "response.event", delegation_id: "delegation_1", event: {
  type: "response.output_item.done", item: { type: "function_call", call_id: "call_1", name: "task_create", arguments: "{\"title\":\"Ara\"}" }
}});
expect(mockExecute).toHaveBeenCalledOnce();
expect(fakeSideband.sent).toContainEqual(expect.objectContaining({ type: "response.item.create" }));
expect(fakeSideband.sent).toContainEqual(expect.objectContaining({ type: "response.create" }));
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/live/live-sideband-service.test.ts tests/live/live-observability.test.ts`

Expected RED reason: sideband service and safe lifecycle recorder do not exist.

- [ ] **Step 3: Implement the minimal protocol.** Construct `SidebandWS` using the server `OpenAI` client and the persisted OpenAI session ID. Attach immediately after bootstrap succeeds. Correlate `response.created`, `response.output_item.done`, and terminal events by response ID; process only completed function-call items. Validate name/JSON through the shared catalog, serialize success or stable failure output, submit every required call output, then continue the delegated response. A repeated event with the same call ID must reuse the same deterministic idempotency key and may not create another action. If sideband attachment fails, set `FAILED`, close the Live session best-effort, and prevent privileged functions.

- [ ] **Step 4: Add failure cases before broad verification.** Cover malformed arguments, unknown tool name, permission denial, action exception, verification failure, duplicate function delivery, `response.error`, and sideband close. Each case must produce a non-success function output or terminate privileged work; none may append a completed business statement.

- [ ] **Step 5: Verify GREEN and regressions.**

Run: `npx vitest run tests/live/live-sideband-service.test.ts tests/live/live-observability.test.ts tests/agent/metrix-business-tool-runtime.test.ts tests/actions/task-create.test.ts tests/actions/customer-create.test.ts`

Expected GREEN: Live-native function results use the existing deterministic runtime, an `ActionExecution` is verified before success output, and lifecycle logs contain no forbidden payloads.

- [ ] **Step 6: Commit boundary.**

```bash
git add src/lib/live/live-sideband-service.ts src/lib/live/live-observability.ts tests/live/live-sideband-service.test.ts tests/live/live-observability.test.ts
git commit -m "feat: handle trusted Live sideband function lifecycle"
```

### Task 7: Make text compatibility consume the same canonical backend catalog

**Purpose:** Prevent a permanent Voice METRIX versus Text METRIX split while retaining `/api/metrix` safely during rollout.

**Files:**

- Modify: `src/lib/agent/metrix-executive-agent.ts`
- Modify: `src/lib/agent/tools/task-create-tool.ts`
- Modify: `src/lib/agent/tools/customer-create-tool.ts`
- Modify: `src/lib/agent/tools/customer-lookup-tool.ts`
- Modify: `src/app/api/metrix/route.ts`
- Modify: `tests/agent/metrix-executive-agent.test.ts`
- Modify: `tests/api/metrix-route.test.ts`
- Create: `tests/agent/text-live-contract-parity.test.ts`

**Interfaces:**

- The text agent consumes `buildMetrixExecutiveBackendInstructions` and the three wrappers backed by `executeMetrixBusinessTool`.
- The Live config consumes the same backend instruction builder and `METRIX_RESPONSES_FUNCTION_TOOLS`.
- `/api/metrix` retains request shape `{ message, turnId }` and its existing server-derived auth context.

- [ ] **Step 1: Write the failing parity test.**

```ts
expect(readFileSync("src/lib/agent/metrix-executive-agent.ts", "utf8"))
  .toContain("buildMetrixExecutiveBackendInstructions");
expect(readFileSync("src/lib/live/live-session-config.ts", "utf8"))
  .toContain("buildMetrixExecutiveBackendInstructions");
expect(METRIX_RESPONSES_FUNCTION_TOOLS.map((tool) => tool.name)).toEqual(
  createMetrixExecutiveAgent().tools.map((tool) => tool.name)
);
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/agent/text-live-contract-parity.test.ts`

Expected RED reason: the current text agent and Live configuration do not yet share both catalog and instruction source.

- [ ] **Step 3: Implement minimal parity wiring.** Keep `/api/metrix` in place as a documented compatibility/fallback route. Remove any duplicated business-rule strings or action dispatch from its private path; do not delete the route, add routing logic, or alter its public request contract.

- [ ] **Step 4: Verify GREEN and pipeline regression.**

Run: `npx vitest run tests/agent/text-live-contract-parity.test.ts tests/agent/metrix-executive-agent.test.ts tests/agent/executive-pipeline.acceptance.test.ts tests/api/metrix-route.test.ts`

Expected GREEN: both transports share one backend policy and canonical actions; the existing text mutation pipeline still reaches `VERIFIED` once.

- [ ] **Step 5: Commit boundary.**

```bash
git add src/lib/agent src/app/api/metrix/route.ts tests/agent tests/api/metrix-route.test.ts
git commit -m "refactor: align text fallback with Live METRIX contract"
```

### Task 8: Add the minimal browser voice surface and direct WebRTC client

**Purpose:** Provide a production-acceptance surface without redesigning METRIX or moving trusted logic into the browser.

**Files:**

- Create: `src/app/voice/page.tsx`
- Create: `src/app/voice/voice-session-client.tsx`
- Create: `src/app/voice/voice-session-client-state.ts`
- Create: `tests/voice/voice-session-client-state.test.ts`
- Create: `tests/architecture/voice-browser-boundary.test.ts`

**Interfaces:**

- Produces `reduceVoiceSessionState(state, event): VoiceSessionState` with states `idle`, `requesting_microphone`, `negotiating`, `connected`, `recoverable_error`, and `closed`.
- Browser sends `POST /api/metrix/live/session` with only `{ sdp }`; it applies `{ answerSdp }` to `RTCPeerConnection`.
- Browser data channel handles permitted Live lifecycle/transcript events only. It never sends function results or server-control commands.

- [ ] **Step 1: Write the failing pure-state and boundary tests.**

```ts
expect(reduceVoiceSessionState({ phase: "requesting_microphone" }, { type: "MICROPHONE_DENIED" }))
  .toEqual({ phase: "recoverable_error", code: "MICROPHONE_DENIED" });
expect(readFileSync("src/app/voice/voice-session-client.tsx", "utf8"))
  .not.toMatch(/OPENAI_API_KEY|client\.live\.create|SidebandWS|response\.item\.create/);
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/voice/voice-session-client-state.test.ts tests/architecture/voice-browser-boundary.test.ts`

Expected RED reason: the voice page, reducer, and browser-boundary implementation do not exist.

- [ ] **Step 3: Implement the minimal client.** Render Start and Stop controls, microphone/connection state, a muted status region for recoverable errors, and one `<audio autoPlay>` remote output element. On Start, call `getUserMedia({ audio: true })`, add tracks to `RTCPeerConnection`, create the allowed `oai-events` data channel, create/set the local offer, send its SDP to the authenticated endpoint, set the returned answer, and attach remote tracks to the audio element. On Stop or connection failure, stop local tracks, close data channel/peer connection, and reset reducer state. Do not add a voice selector, transcript history UI, custom VAD, custom interrupt command, custom audio processing, or a debug log panel.

- [ ] **Step 4: Verify GREEN and browser compilation.**

Run: `npx vitest run tests/voice/voice-session-client-state.test.ts tests/architecture/voice-browser-boundary.test.ts && npm run typecheck`

Expected GREEN: deterministic browser state failures are covered, and static source checks establish that no server secret/control implementation entered the client.

- [ ] **Step 5: Commit boundary.**

```bash
git add src/app/voice tests/voice tests/architecture/voice-browser-boundary.test.ts
git commit -m "feat: add minimal direct WebRTC voice surface"
```

### Task 9: Close, disconnect, retry, and idempotency safety

**Purpose:** Make failure behavior explicit without replaying privileged work or claiming a business completion after connection loss.

**Files:**

- Create: `src/app/api/metrix/live/session/[sessionId]/close/route.ts`
- Modify: `src/lib/live/live-session-store.ts`
- Modify: `src/lib/live/live-session-service.ts`
- Modify: `src/lib/live/live-sideband-service.ts`
- Modify: `src/app/voice/voice-session-client.tsx`
- Create: `tests/api/metrix-live-session-close-route.test.ts`
- Modify: `tests/live/live-session-service.test.ts`
- Modify: `tests/live/live-sideband-service.test.ts`
- Modify: `tests/voice/voice-session-client-state.test.ts`

**Interfaces:**

- Consumes an authenticated opaque binding ID and `loadLiveSessionBinding`; it never accepts actor/org IDs.
- Produces `closeLiveSession(input: { binding: LiveSessionBinding }): Promise<void>`.
- A sideband function call uses `live:${binding.id}:call:${callId}` as its idempotency scope on every delivery/retry.

- [ ] **Step 1: Write failing safety tests.**

```ts
await expect(closeRoute(requestForDifferentUser, { params: Promise.resolve({ sessionId: binding.id }) }))
  .resolves.toMatchObject({ status: 404 });
await service.handle(duplicateFunctionCall("call_1"));
expect(mockExecute).toHaveBeenCalledTimes(2);
expect(executeTaskCreate).toHaveBeenCalledWith(expect.objectContaining({
  idempotencyKey: `live:${binding.id}:call:call_1:task.create`
}));
expect(createdTaskCount).toBe(1);
```

- [ ] **Step 2: Run the tests and confirm RED.**

Run: `npx vitest run tests/api/metrix-live-session-close-route.test.ts tests/live/live-session-service.test.ts tests/live/live-sideband-service.test.ts tests/voice/voice-session-client-state.test.ts`

Expected RED reason: authenticated close and duplicate-delivery semantics are absent.

- [ ] **Step 3: Implement safety behavior.** The client sends a best-effort same-origin close only for its opaque binding ID; server reauthenticates and returns `404` for a non-owned binding. On WebRTC or data-channel loss, the client enters `recoverable_error`, stops playback/input, and does not automatically re-send an SDP, transcript, tool call, or action request. The sideband marks the binding `DISCONNECTED`/`FAILED`, closes on permanent error, and its deterministic idempotency scope makes repeated call delivery a readback-backed replay rather than a duplicate mutation.

- [ ] **Step 4: Verify GREEN and action regressions.**

Run: `npx vitest run tests/api/metrix-live-session-close-route.test.ts tests/live/live-session-service.test.ts tests/live/live-sideband-service.test.ts tests/voice/voice-session-client-state.test.ts tests/actions/task-create.test.ts tests/actions/customer-create.test.ts`

Expected GREEN: reconnect/retry cannot duplicate the covered mutation; microphone denial, session bootstrap failure, WebRTC loss, sideband error, tool validation/permission/action/readback failures each produce no fabricated success.

- [ ] **Step 5: Commit boundary.**

```bash
git add src/app/api/metrix/live/session src/lib/live src/app/voice tests/api tests/live tests/voice
git commit -m "feat: harden Live disconnect and retry safety"
```

### Task 10: Establish deterministic integration acceptance for native Live function continuation

**Purpose:** Prove the server-controlled portion of spoken mutation flow without pretending a unit test proves browser audio.

**Files:**

- Create: `tests/live/live-mutation-pipeline.acceptance.test.ts`
- Modify: `tests/live/live-sideband-service.test.ts`
- Modify: `tests/live/live-observability.test.ts`

**Interfaces:**

- Test path: synthetic native nested function event → `executeMetrixBusinessTool` → existing `executeTaskCreate` → `ActionExecution` `VERIFIED` → `function_call_output` → `response.create`.
- The assertion source of truth is the database readback and serialized verified function result, not model prose or a transcript.

- [ ] **Step 1: Write the failing integration acceptance test.**

```ts
await feedCompletedFunctionCall(sideband, {
  responseId: "resp_1",
  callId: "call_1",
  name: "task_create",
  arguments: JSON.stringify({ title: "Tahsilatı ara", priority: "HIGH" })
});
expect(await db.actionExecution.findUnique({ where: actionKey })).toMatchObject({ status: "VERIFIED" });
expect(parseFunctionOutput(fakeSideband.sent)).toMatchObject({ verified: true, status: "VERIFIED" });
expect(fakeSideband.sent.at(-1)).toMatchObject({ type: "response.create" });
```

- [ ] **Step 2: Run the test and confirm RED.**

Run: `npx vitest run tests/live/live-mutation-pipeline.acceptance.test.ts`

Expected RED reason: no complete native Live-function-to-deterministic-runtime acceptance fixture exists.

- [ ] **Step 3: Implement only fixture support required by the test.** Reuse the Task 6 service and its injected fake transport; do not add a mock Live model, a new semantic agent, or an alternate business action. Create test tenant/user/membership and clean every created `ActionExecution`, task, membership, user, and organization in `afterAll`.

- [ ] **Step 4: Verify GREEN and the full deterministic voice slice.**

Run: `npx vitest run tests/live/live-mutation-pipeline.acceptance.test.ts tests/live/live-sideband-service.test.ts tests/agent/executive-pipeline.acceptance.test.ts tests/actions/task-create.test.ts`

Expected GREEN: both text compatibility and Live sideband paths reach the same verified action exactly once, and neither test equates backend completion with audible delivery.

- [ ] **Step 5: Commit boundary.**

```bash
git add tests/live/live-mutation-pipeline.acceptance.test.ts tests/live/live-sideband-service.test.ts tests/live/live-observability.test.ts
git commit -m "test: cover verified Live mutation continuation"
```

### Task 11: Run full automated regression and production hardening review

**Purpose:** Verify the complete deterministic runtime and enforce the no-new-architecture constraints before human audio acceptance.

**Files:**

- Modify only files required by a failing regression from Tasks 1–10.
- Do not add a new subsystem, package, UI flow, voice profile, or unrelated capability in this task.

**Interfaces:**

- Consumes all previous production interfaces unchanged.
- Produces a verified build/test baseline and a source-level security regression suite.

- [ ] **Step 1: Add failing architecture regression assertions if any global rule lacks a test.** Required assertions: no API key string in `src/app/voice`; no browser `OpenAI` client, `SidebandWS`, or function-result sender; no Live config whose backend differs from `gpt-5.6-sol`; no duplicate action executor outside `src/lib/actions`; no timer-based commentary sender; and no second `new Agent` semantic owner.

- [ ] **Step 2: Run those assertions and confirm RED before each missing guard is implemented.**

Run: `npx vitest run tests/architecture/voice-browser-boundary.test.ts tests/agent/text-live-contract-parity.test.ts tests/agent/metrix-executive-agent.test.ts`

Expected RED reason: only a missing concrete guard should fail; do not change behavior to make a source scan pass.

- [ ] **Step 3: Make the smallest correction required by the failing guard.** Preserve direct WebRTC, Responses delegation, canonical dispatcher, server-derived context, and the absence of forced second backchannel.

- [ ] **Step 4: Run complete verification.**

Run: `npm test && npm run typecheck && npm run build && npx prisma validate && git diff --check`

Expected GREEN: all deterministic tests, type checking, production build, Prisma schema validation, and whitespace validation pass.

- [ ] **Step 5: Commit boundary.**

```bash
git add src tests prisma
git commit -m "test: verify production Live voice boundaries"
```

### Task 12: Perform mandatory real-browser production acceptance

**Purpose:** Evaluate the user experience the automated suite cannot prove. This task is an acceptance gate, not a replacement implementation or a pass based on SDK methods.

**Files:**

- Modify: none unless a real-browser defect is diagnosed and fixed through its owning earlier task with a new RED test.
- Record acceptance evidence in the existing delivery/QA system; do not add a speculative telemetry product or transcript store.

**Interfaces:**

- Consumes the authenticated `/voice` page, production-equivalent authenticated environment, direct WebRTC session, and sideband lifecycle instrumentation.
- Produces timestamped human acceptance observations, not synthetic audio assertions.

- [ ] **Step 1: Establish a production-equivalent authenticated test tenant.** Use a controlled organization/user and a unique spoken task title. Confirm the tenant has a valid `metrix_session` and that no browser source, network request, or local storage item contains `OPENAI_API_KEY`, database credentials, actor/org authority, or a privileged tool credential.

- [ ] **Step 2: Execute the normal Live test.** Start voice, grant microphone permission, say “Merhaba METRIX, nasılsın?”, and confirm direct WebRTC connected state, natural audio playback, and the measured session creation, turn-end, first Live audio, and playback-start lifecycle events.

- [ ] **Step 3: Execute native delegation and continuity.** Say “Bir şirkette satışlar artarken nakit akışının kötüleşmesinin en önemli iki yönetim nedenini değerlendir.” Confirm a `session.delegation.created` event targeting Responses, a Sol delegated-result lifecycle event, and final audio from the same METRIX voice. Then ask “Bunlardan hangisini önce kontrol ederdin?” without ending the session; confirm context continuity.

- [ ] **Step 4: Execute barge-in.** While METRIX is speaking, say “Bir saniye, daha kısa anlat.” Confirm user speech is accepted, old audio stops appropriately, a concise new answer plays, no duplicate overlapping answer remains, and the WebRTC session stays connected. Do not add a timer-driven second acknowledgement if there is silence while Sol reasons.

- [ ] **Step 5: Execute a real spoken mutation.** Say “Yüksek öncelikli ‘Sesli kabul tahsilatını ara’ görevi oluştur.” Confirm the nested Responses function call reaches `task_create`, canonical `executeTaskCreate` authorizes the test tenant, one `ActionExecution` becomes `VERIFIED`, DB readback matches title/priority, and only then GPT-Live-1 speaks completion. Repeat or reconnect without a new business request and confirm no duplicate task is created.

- [ ] **Step 6: Exercise recoverable failures.** Deny microphone permission once; simulate/observe bootstrap failure, WebRTC disconnect, and sideband failure in the controlled environment. Confirm each message is honest and no action is reported complete. Confirm retry requires a new authenticated session and stale requests cannot act for another tenant.

- [ ] **Step 7: Gate release outcome.** Mark production voice ready only if every browser item above and Task 11 pass. A non-working microphone, media path, audible first response, native delegation, same-METRIX delivery, barge-in, follow-up context, verified spoken mutation, sideband binding, or API-key isolation blocks acceptance.

- [ ] **Step 8: Commit boundary.** No code commit belongs to this acceptance task. If a defect is found, return to the owning task, add its failing deterministic test where possible, fix, rerun Task 11, and repeat this browser gate.

## Self-Review

| Freeze requirement | Plan coverage |
| --- | --- |
| Live sole user-facing owner; Sol delegated authority; one METRIX | Tasks 1, 4, 7, 8, and 12. |
| Direct WebRTC and server sideband | Tasks 4, 5, 6, 8, and 12. |
| Canonical tools and deterministic verified runtime | Tasks 2, 6, 7, 9, 10, and 12. |
| Server-derived actor/org/permissions/idempotency | Tasks 2, 3, 5, 6, 9, and 10. |
| API key and privileged-authority isolation | Tasks 4, 5, 8, 11, and 12. |
| Native Live → Sol → same Live delivery | Tasks 4, 6, 10, and 12. |
| Barge-in and same-session continuity | Tasks 8, 9, and 12. |
| Honest failures and no fabricated completion | Tasks 3–6, 9–12. |
| Minimal latency observability | Tasks 6, 8, and 12. |
| No forced second backchannel; no personalization or unrelated work | Global Constraints, Tasks 8, 11, and 12. |

The plan has no reserved unfinished markers, all named interfaces are produced before they are consumed, the text route is retained only as a shared-contract compatibility fallback, and the required spoken real mutation reaches `ActionExecution` verification and DB readback before spoken completion.
