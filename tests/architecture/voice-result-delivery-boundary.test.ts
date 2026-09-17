import {
  readdirSync,
  readFileSync
} from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";

const sidebandPath =
  "src/lib/live/live-sideband-service.ts";

const delegationBridgePath =
  "src/lib/live/live-delegation-bridge.ts";

const storePath =
  "src/lib/live/live-session-store.ts";

const deliveryRoutePath =
  "src/app/api/metrix/live/session/[bindingId]/result/route.ts";

const clientPath =
  "src/app/voice/voice-session-client.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe(
  "generic Voice -> UI TurnResult delivery bridge boundary",
  () => {
    it(
      "routes every Live business turn through the exact same backend Executive (runMetrixExecutiveTurn) and projection the text turn uses",
      () => {
        const source = read(delegationBridgePath);

        // Under client delegation there is no per-tool-call registry or
        // dispatch left in this file at all — Sol/METRIX's own native
        // tool-selection (the same Agent/tool set the text /api/metrix
        // route runs, via runMetrixExecutiveTurn) is the single canonical
        // dispatcher for both surfaces. A second dispatch mechanism here
        // would be a second semantic owner.
        expect(source).toContain(
          "runMetrixExecutiveTurn"
        );

        expect(source).toContain(
          "projectCapabilityResults"
        );

        expect(source).toContain(
          "publishLiveSessionTurnResult"
        );

        expect(source).not.toMatch(
          /executeMetrixBusinessTool|canonicalResultForToolCall|METRIX_BUSINESS_TOOL_CONTRACTS/
        );
      }
    );

    it(
      "publishes the TurnResult as soon as the backend Executive turn succeeds, strictly before the spoken commentary reply is ever attempted",
      () => {
        const source = read(delegationBridgePath);

        // The retired Responses-delegation protocol's per-response
        // capture/flush bookkeeping (beginToolCallCapture/
        // endToolCallCapture called directly from THIS file, plus its own
        // responseId-resolution bugs) does not exist here — turn-scoped
        // capture now lives once, inside runMetrixExecutiveTurn, shared
        // identically with text.
        expect(source).not.toMatch(
          /beginToolCallCapture|endToolCallCapture|capturedResponses/
        );

        // deliverTurnResult must be called, textually and structurally,
        // before sendCommentary within handleDelegationCreated — never
        // the reverse, and never gated on the commentary send's own
        // success.
        const deliverCallSite = source.indexOf(
          "await deliverTurnResult("
        );

        const commentaryCallSite = source.indexOf(
          "sendCommentary(\n        delegation.id,\n        result.finalOutput"
        );

        expect(deliverCallSite).toBeGreaterThan(-1);
        expect(commentaryCallSite).toBeGreaterThan(-1);
        expect(deliverCallSite).toBeLessThan(commentaryCallSite);
      }
    );

    it(
      "defines no second, voice-only business tool registry, classifier, or presentation architecture",
      () => {
        const source = read(delegationBridgePath);

        expect(source).not.toMatch(
          /VOICE_BUSINESS_TOOL|LIVE_ONLY_TOOL|voiceToolRegistry|liveToolRegistry|voiceIntentClassifier|voiceRouter|voicePlanner|customerToolResult|stockToolResult|MetrixLiveDispatchAgent|executive_reasoning/i
        );
      }
    );

    it(
      "keeps the delivery endpoint transport-only: authenticated, session-scoped, no business mutation",
      () => {
        const source = read(deliveryRoutePath);

        expect(source).toContain(
          "resolveAuthenticatedExecutiveContext"
        );

        expect(source).toContain(
          "loadLiveSessionTurnResultState"
        );

        expect(source).toMatch(
          /export async function GET/
        );

        expect(source).not.toMatch(
          /export async function POST|export async function PATCH|export async function DELETE/
        );

        expect(source).not.toMatch(
          /executeMetrixBusinessTool|customer_lookup|inventory_lookup|task_list|intentClassifier|semanticRouter/
        );
      }
    );

    it(
      "persists the delivered TurnResult as ephemeral, TTL-bounded data on the existing LiveSession binding — no new business table",
      () => {
        const source = read(storePath);

        expect(source).toContain(
          "publishLiveSessionTurnResult"
        );

        expect(source).toContain(
          "loadLiveSessionTurnResultState"
        );

        expect(source).toContain(
          "LIVE_SESSION_RESULT_TTL_MS"
        );

        expect(source).toMatch(
          /db\.liveSession\.(update|findFirst)/
        );
      }
    );

    it(
      "clears the ephemeral result when a Live session disconnects or fails",
      () => {
        const source = read(storePath);

        const disconnectStart = source.indexOf(
          "export async function markLiveSessionDisconnected"
        );

        const disconnectBlock = source.slice(
          disconnectStart,
          source.indexOf(
            "export async function loadLiveSessionBinding"
          )
        );

        const failedBlock = source.slice(
          source.indexOf("export async function markLiveSessionFailed"),
          source.indexOf("export async function markLiveSidebandAttached")
        );

        expect(disconnectBlock).toContain(
          "turnResultJson"
        );

        expect(failedBlock).toContain(
          "turnResultJson"
        );
      }
    );

    it(
      "leaves WebRTC/microphone/audio/barge-in code untouched and never branches result delivery on the model's own data-channel content",
      () => {
        const source = read(clientPath);

        // Still the same trust-boundary surface — unchanged by this
        // operation.
        expect(source).toContain("RTCPeerConnection");
        expect(source).toContain("getUserMedia");
        expect(source).toContain('"/api/metrix/live/session"');
        expect(source).toContain('createDataChannel("oai-events")');

        // Result delivery is a push from the server (EventSource), never
        // a decision the browser makes from event.data content — and
        // never a fixed poll cadence either.
        expect(source).toContain("EventSource");
        expect(source).not.toMatch(/setInterval/);

        expect(source).not.toMatch(
          /if\s*\(\s*event\.data\s*===|event\.data\.includes|event\.data\.type\s*===\s*["']result/
        );
      }
    );

    it(
      "pushes result delivery over one native, authenticated SSE stream instead of the browser polling",
      () => {
        const routeSource = read(deliveryRoutePath);

        expect(routeSource).toContain("text/event-stream");
        expect(routeSource).toContain("ReadableStream");

        // Access is still checked before anything is ever sent, exactly
        // like the original polled GET — an SSE response cannot change
        // its status after streaming begins.
        expect(routeSource).toContain(
          "resolveAuthenticatedExecutiveContext"
        );
        expect(routeSource).toContain("loadLiveSessionTurnResultState");
      }
    );

    it(
      "derives delivery correctness from the durable turnResultVersion row alone, never from any in-process singleton",
      () => {
        const routeSource = read(deliveryRoutePath);

        // Proven (not assumed) unreliable: two different Next.js route
        // bundles can hold two different module instances of what looks
        // like the same shared singleton (an EventEmitter, a Set, a Map),
        // silently, with no error — and that divergence can even change
        // mid-connection as routes get recompiled. This route must not
        // depend on any such mechanism for correctness.
        expect(routeSource).not.toMatch(
          /EventEmitter|node:events|subscribeTo\w+Events|publish\w+Event\(/
        );

        // The stream re-derives freshness by re-reading the same durable
        // function a reconnecting client's first read also uses — one
        // source of truth for "current" and "new".
        const readCallCount = (
          routeSource.match(/loadLiveSessionTurnResultState\(/g) ?? []
        ).length;

        expect(readCallCount).toBeGreaterThanOrEqual(2);
      }
    );

    it(
      "notifies only through a plain re-read timer, no custom pub/sub, router, or distributed state machine",
      () => {
        const routeSource = read(deliveryRoutePath);

        expect(routeSource).toContain("setInterval");

        expect(routeSource).not.toMatch(
          /class\s+\w*Bus|class\s+\w*Dispatcher|class\s+\w*Router|class\s+\w*StateMachine/
        );

        // No second file reintroducing an in-process notification layer.
        const libLiveDir = readdirSync("src/lib/live");

        expect(libLiveDir).not.toContain("live-workspace-events.ts");
        expect(libLiveDir).not.toContain("live-result-events.ts");
      }
    );

    it(
      "leaves no trace of the retired domain-Workspace presentation architecture",
      () => {
        const source = read(sidebandPath);

        expect(source).not.toMatch(
          /WorkspaceDirective|deriveWorkspaceDirective|workspace-projection/
        );
      }
    );
  }
);
