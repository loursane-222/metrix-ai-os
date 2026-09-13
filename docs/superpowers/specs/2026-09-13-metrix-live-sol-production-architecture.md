# METRIX Live-1 + Sol Production Architecture Freeze

**Status:** Accepted architecture decision
**Scope:** Production voice runtime architecture only; this document does not implement it.

## Decision

METRIX has one user-facing conversational owner: **GPT-Live-1**. It is the
voice surface for natural conversation, immediate acknowledgement, audio
playback, interruption, and same-session continuity. When deeper executive
reasoning is needed, GPT-Live-1 uses **native OpenAI delegation** to
**GPT-5.6 Sol**. Sol returns its reasoning result to the same Live
conversation, and GPT-Live-1 delivers it as the same METRIX persona.

Business truth remains outside the models. Canonical METRIX tools/evidence
and the deterministic business runtime execute, verify, and read back every
business operation before it can be communicated as completed.

```text
User
  <-> GPT-Live-1
  <-> native OpenAI delegation
  <-> GPT-5.6 Sol
  <-> canonical METRIX tools / evidence
  <-> deterministic business runtime
  <-> verification / readback
  <-> same GPT-Live-1 conversation
  <-> User
```

The accepted real-browser experience is the UX baseline. The user described
that experience as “tek kelimeyle mükemmeldi”; production must preserve the
behavior that produced that acceptance rather than replace it with a parallel
voice design.

## Ownership boundaries

### GPT-Live-1: sole conversational owner

GPT-Live-1 exclusively owns the user-facing METRIX conversation:

- natural, immediate reactions and continuous conversation;
- voice input/output, response delivery, and the single METRIX persona;
- interruption/barge-in handling and continuation after an interruption;
- natural delivery of delegated Sol results in the same Live conversation.

It is not a thin voice shell over a separate text endpoint. There must be no
second user-facing executive assistant, no separate Voice METRIX, and no
competing semantic owner.

### GPT-5.6 Sol: delegated executive reasoning authority

GPT-5.6 Sol is the authority for delegated deep executive reasoning:

- root-cause reasoning and evidence-aware executive judgment;
- prioritization, management judgment, and strategic reasoning;
- interpretation of canonical METRIX evidence and tool results.

Sol is not a user-facing persona. GPT-Live-1 chooses native delegation when
deeper reasoning is needed; no custom intent classifier, semantic router, or
planner is introduced between Live and Sol. The architecture must not describe
this as a custom router through which Live directly calls Sol, nor as a voice
wrapper around the existing text endpoint.

### Deterministic action runtime: sole business truth authority

The deterministic runtime alone owns transaction and business truth:

- authorization, tenant isolation, permissions, and persistence;
- idempotency, execution, verification, and readback;
- the authoritative result for every state-changing or business operation.

Only a verified, read-back result may be communicated as completed. Models may
request canonical capabilities and explain results, but may not manufacture
completion, authorization, or business truth.

## Transport, control, and trust boundary

The production transport/control topology is:

```text
Browser microphone and playback
  <-> direct WebRTC <-> OpenAI GPT-Live-1
                              ^
                              | same Live session
                              v
                 authenticated METRIX server sideband/control
```

Browser media remains direct WebRTC to OpenAI whenever supported. The server
does not relay audio. A custom server audio relay is prohibited unless future
evidence establishes that it is unavoidable.

The authenticated METRIX server owns authentication; derives actor and
organization; supplies trusted context; connects sideband/control; integrates
Sol delegation; and invokes canonical business tools and the deterministic
runtime. The browser must never receive any of the following:

- `OPENAI_API_KEY` or database credentials;
- trusted actor or organization identity;
- business authority or privileged execution capability;
- server-owned permission, idempotency, or verification authority.

The browser receives only the limited session material needed for its direct
WebRTC connection. Server-side controls attach to the same Live session and
remain the trusted path for server operations.

## Native delegation and canonical tools

Native/model tool-selection semantics are preserved. GPT-Live-1 uses OpenAI
native delegation for deep work, GPT-5.6 Sol reasons over trusted context and
canonical evidence, and results return to the same Live conversation.

Voice and text use the same canonical business capability implementations.
They must not gain parallel voice-only versions of at least these capabilities:

- `task_create`;
- `customer_create`;
- `customer_lookup`.

The following are server-derived or server-controlled, never free
model-controlled tool arguments: `actorId`, `organizationId`, permissions,
authentication identity, idempotency authority, and server-owned trusted
timestamps. Tool responses that describe a completed action are valid only
after runtime verification and readback.

## One METRIX across voice and text

The product target is one METRIX, not distinct voice and text semantic
products. Wherever Live support is available, the Live conversational surface
is the user-facing METRIX experience and Sol is its delegated executive
reasoning authority.

The current `/api/metrix` Sol route may remain temporarily for compatibility
or fallback during migration. It must not become a competing semantic owner,
separate persona, or alternative routing authority. Any migration preserves
one METRIX identity, canonical tools, and deterministic runtime semantics.

## UX and latency invariants

The required runtime sequence is:

1. The user speaks naturally.
2. GPT-Live-1 reacts immediately and naturally.
3. When deep reasoning is required, native delegation reaches GPT-5.6 Sol.
4. GPT-Live-1 may make a natural acknowledgement while Sol reasons.
5. Sol's result returns to the same Live conversation.
6. GPT-Live-1 delivers it as the same METRIX voice and persona.
7. A user may barge in while METRIX is speaking; the current response stops
   appropriately, the new turn is accepted, and the session stays continuous.
8. No duplicate overlapping answer or second assistant persona appears.

The low-latency path must not add a custom classifier, semantic router,
planner, narration layer, duplicate executive agent, custom STT/TTS hop,
server audio proxy, or unnecessary REST round trip. Browser audio remains
direct WebRTC where possible; sideband/control handles trusted server work.

### Backchannel decision

The immediate first acknowledgement is accepted behavior. A forced second
three-to-four-second backchannel is **not** a production requirement:

- the previous real spike did not prove a second
  `session.commentary.append`-style backchannel;
- no custom TTS, second conversational agent, narration agent, or timer-driven
  semantic speaker may be added to simulate it;
- if future native OpenAI support makes an additional backchannel safe and
  simple, it is a separate decision.

## Voice personalization boundary

Voice personalization is a later product increment. The architecture can use
actually supported OpenAI voice selection and presentation/persona
instructions. It must not claim biological gender, actual age, or guaranteed
age transformation. Any future labels such as young/mature or male/female-like
profiles require an honest mapping to real supported voices and perceptual
descriptions.

Voice-profile settings UI is outside the first production voice runtime.

## Minimum first production increment

The first increment contains only the following runtime capabilities:

1. Authenticated voice-session bootstrap.
2. Browser direct WebRTC connection.
3. GPT-Live-1 session configuration.
4. Authenticated server sideband/control attachment.
5. Trusted METRIX executive-context injection.
6. Native GPT-Live-1 to GPT-5.6 Sol delegation.
7. Same-session Sol-result delivery by Live.
8. Barge-in/interruption support.
9. Same-session conversation continuity.
10. Integration with existing canonical business/runtime authority.
11. API-key isolation.
12. Observability for latency and lifecycle debugging.
13. Automated tests for deterministic behavior.
14. Real-browser acceptance for audio, interruption, and delegation.

It excludes voice-profile settings UI, broad workspace redesign, unrelated
business capabilities, Always-On Watch, autonomy features, notification
architecture, and custom memory architecture.

## Failure and integrity behavior

| Condition | Required behavior |
| --- | --- |
| Live session creation fails | Do not open a partially trusted session; report an honest retryable failure. |
| Sideband attachment fails | Do not enable privileged business execution; end or degrade only to a clearly non-privileged path. |
| Delegation fails | Live acknowledges the limitation honestly and does not fabricate a Sol result. |
| Sol times out or errors | Live communicates that deeper reasoning did not complete and offers a safe retry or narrower request. |
| Business tool fails | Surface failure or pending status accurately; do not claim completion. |
| Verification/readback fails | Treat the operation as unverified; do not communicate it as completed. |
| WebRTC disconnects | Stop playback/input cleanly, preserve no false completion state, and require a new authenticated connection as appropriate. |
| Microphone permission is denied | Keep the session from claiming audio input is active and give an honest permission/retry path. |

Across all failures, METRIX never fabricates success, never invents a verified
business result, and never converts an unverified side effect into a completed
user-facing statement.

## Observability and acceptance evidence

The production runtime must make safe lifecycle and latency diagnosis possible,
including session-connect time, user-turn end, first Live response event, first
audio received, playback start, delegation start, delegated-result return,
final Live audio start, interruption, and the first response after interruption.
Logs and telemetry must not expose credentials or grant client-side authority.

Automated coverage verifies deterministic server/runtime contracts. Real
browser acceptance remains mandatory for microphone input, WebRTC media,
audible first-response latency, barge-in, same-session continuity, native
delegation, and same-persona delivery. A protocol method or transcript event
alone is not proof of browser audio playback or interruption behavior.

## Architecture constraints for future changes

Any future change must preserve these decisions unless this document is
explicitly superseded:

- GPT-Live-1 remains the only user-facing conversational owner.
- Sol remains delegated executive reasoning, never a second persona.
- Native delegation and canonical tool semantics are retained.
- The deterministic runtime remains the only source of business completion.
- Browser WebRTC remains direct where supported, with trusted server sideband
  rather than an audio relay.
- The API-key and privileged-authority boundary remains server-side.
