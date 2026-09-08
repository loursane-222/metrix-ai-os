import { latencyMark } from "@/lib/voice/realtime-bridge/latency";
import { requireAuthContextFromCookies, authFail } from "@/lib/auth/guards/api-auth-guard";
import { fail, ok } from "@/lib/api/response";
import { metrixExecutiveTurn, type BridgeTurnInput } from "@/lib/voice/realtime-bridge/turn";
export const maxDuration = 120;
export async function POST(request: Request) {
  const receivedAt = performance.now();
  let auth;
  try { auth = await requireAuthContextFromCookies(); } catch (error) { return authFail(error); }
  let body: BridgeTurnInput;
  try {
    const raw = await request.json();
    const keys = ["sessionToken", "sessionId", "conversationId", "turnId", "generation", "transcript"];
    if (!raw || typeof raw !== "object" || Object.keys(raw).some(k => !keys.includes(k))) return fail("Invalid turn fields", 400);
    if (!["sessionToken", "sessionId", "conversationId", "turnId"].every(k => typeof raw[k] === "string" && raw[k].length > 0 && raw[k].length <= 2048)
      || typeof raw.transcript !== "string" || !raw.transcript.trim() || raw.transcript.length > 4000
      || !Number.isSafeInteger(raw.generation) || raw.generation < 1) return fail("Invalid turn", 400);
    body = raw;
  } catch { return fail("Invalid turn body", 400); }
  latencyMark("server", body.turnId, "company_request_received", receivedAt);
  if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
    try {
      const response = ok(await metrixExecutiveTurn(auth, body, request.signal));
      latencyMark("server", body.turnId, "company_response_complete");
      return response;
    }
    catch { return fail(request.signal.aborted ? "Turn cancelled" : "Executive turn unavailable", request.signal.aborted ? 409 : 502); }
  }
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const encoder = new TextEncoder();
  let respond!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { respond = resolve; });
  let streaming = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Defer until stream is assigned; GENERAL retains its existing JSON path.
      void Promise.resolve().then(async () => {
        const send = (event: unknown) => {
          signal.throwIfAborted();
          if (!streaming) {
            streaming = true;
            respond(new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } }));
          }
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        try {
          const result = await metrixExecutiveTurn(auth, body, signal, send);
          if (result.mode === "GENERAL" && !streaming) respond(ok(result));
          else send({ type: "done", data: result });
          controller.close();
          latencyMark("server", body.turnId, "company_response_complete");
        } catch {
          if (!streaming) respond(fail(signal.aborted ? "Turn cancelled" : "Executive turn unavailable", signal.aborted ? 409 : 502));
          if (!signal.aborted && streaming) { send({ type: "error" }); controller.close(); }
          else { try { controller.error(new Error("Turn cancelled")); } catch {} }
        }
      });
    },
    cancel() { abort.abort(); },
  });
  return response;
}
