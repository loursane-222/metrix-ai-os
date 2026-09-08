import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/guards/api-auth-guard", () => ({ requireAuthContextFromCookies: vi.fn(), authFail: () => Response.json({}, { status: 401 }) }));
vi.mock("../turn", () => ({ metrixExecutiveTurn: vi.fn().mockResolvedValue({ mode: "GENERAL" }) }));
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { metrixExecutiveTurn } from "../turn";
import { POST } from "@/app/api/ai/chat/voice/turn/route";
const auth = { user: { id: "trusted-user" }, organization: { id: "trusted-org" } };
const body = { sessionToken: "signed", sessionId: "s", conversationId: "c", turnId: "t", generation: 1, transcript: "Hello" };
const request = (value: object) => new Request("http://localhost/api/ai/chat/voice/turn", { method: "POST", body: JSON.stringify(value) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireAuthContextFromCookies).mockResolvedValue(auth as never); });
it("passes only cookie authenticated scope and the request abort signal", async () => {
  const req = request(body);
  expect((await POST(req)).status).toBe(200);
  expect(metrixExecutiveTurn).toHaveBeenCalledWith(auth, body, req.signal);
});
it("rejects browser/model organization spoofing before Executive execution", async () => {
  expect((await POST(request({ ...body, organizationId: "other" }))).status).toBe(400);
  expect(metrixExecutiveTurn).not.toHaveBeenCalled();
});
it("rejects unauthenticated calls and invalid generation", async () => {
  expect((await POST(request({ ...body, generation: -1 }))).status).toBe(400);
  vi.mocked(requireAuthContextFromCookies).mockRejectedValueOnce(new Error("unauthenticated"));
  expect((await POST(request(body))).status).toBe(401);
  expect(metrixExecutiveTurn).not.toHaveBeenCalled();
});

it("streams entry and progressive frames while Executive is unresolved, then completes", async () => {
  let complete!: () => void;
  const gate = new Promise<void>(resolve => { complete = resolve; });
  vi.mocked(metrixExecutiveTurn).mockImplementationOnce(async (_auth, input, _signal, emit) => {
    emit!({ ...input, type: "chunk", phase: "opening", content: "Reaction.", sequence: 1 });
    emit!({ ...input, type: "chunk", phase: "primary", content: "Finding. ", sequence: 2, progressive: { stage: "finding", evidenceReferences: [] } });
    await gate;
    return { ...input, mode: "COMPANY", executiveResult: "Finding." } as never;
  });
  const req = request(body); req.headers.set("accept", "application/x-ndjson");
  const response = await POST(req);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain('"phase":"opening"');
  expect(decoder.decode((await reader.read()).value)).toContain('"stage":"finding"');
  complete();
  expect(decoder.decode((await reader.read()).value)).toContain('"type":"done"');
  expect((await reader.read()).done).toBe(true);
});
it("retains JSON for General even when streaming is accepted", async () => {
  const req = request(body); req.headers.set("accept", "application/x-ndjson");
  const response = await POST(req);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toMatchObject({ data: { mode: "GENERAL" } });
});
it("reader cancellation aborts the same signal passed to the Executive turn", async () => {
  let aborted!: Promise<void>;
  vi.mocked(metrixExecutiveTurn).mockImplementationOnce(async (_auth, input, signal, emit) => {
    emit!({ ...input, type: "chunk", phase: "opening", content: "Reaction.", sequence: 1 });
    aborted = new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    await aborted;
    signal.throwIfAborted();
    return {} as never;
  });
  const req = request(body); req.headers.set("accept", "application/x-ndjson");
  const response = await POST(req);
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  await aborted;
  expect(vi.mocked(metrixExecutiveTurn).mock.calls[0][2].aborted).toBe(true);
});

it("finishes an already-started stream when classification returns General", async () => {
  vi.mocked(metrixExecutiveTurn).mockImplementationOnce(async (_auth, input, _signal, emit) => {
    emit!({ ...input, type: "chunk", phase: "opening", content: "Bakıyorum.", sequence: 1 });
    return { ...input, mode: "GENERAL" } as never;
  });
  const req = request(body); req.headers.set("accept", "application/x-ndjson");
  const response = await POST(req);
  const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  expect(events.map(event => event.type)).toEqual(["chunk", "done"]);
  expect(events[1].data.mode).toBe("GENERAL");
});
