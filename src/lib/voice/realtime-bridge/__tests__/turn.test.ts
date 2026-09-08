import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
vi.mock("@/lib/conversation-understanding", () => ({ classifyConversation: vi.fn() }));
vi.mock("@/lib/executive-agent/runtime", () => ({ runExecutiveAgent: vi.fn() }));
vi.mock("@/lib/executive-agent/turn-lifecycle", () => ({
  resolveExecutiveConversation: vi.fn().mockResolvedValue({ id: "conversation" }),
  loadExecutiveConversationHistory: vi.fn().mockResolvedValue([null, []]),
  buildExecutiveConversationHistory: vi.fn().mockReturnValue([]),
  prepareExecutiveTurnContext: vi.fn().mockReturnValue({ coreContext: true }),
  buildOrganizationSummary: vi.fn().mockReturnValue("summary"),
  persistCanonicalUserTurn: vi.fn(), persistCanonicalAssistantTurn: vi.fn(),
}));
import { classifyConversation } from "@/lib/conversation-understanding";
import { runExecutiveAgent } from "@/lib/executive-agent/runtime";
import * as lifecycle from "@/lib/executive-agent/turn-lifecycle";
import { EXECUTIVE_CONSTITUTION } from "@/lib/executive-agent/constitution";
import { issueBridgeSession, verifyBridgeSession, REALTIME_BRIDGE_INSTRUCTIONS } from "../session";
import { metrixExecutiveTurn } from "../turn";
const auth = { user: { id: "user" }, organization: { id: "org" } } as AuthContext;
const general = { conversationKind: "general_chat", companyRelevance: "none", actionExpectation: "none", shouldInvokeExecutiveBrain: false, suggestedHandling: "answer_only", confidence: "high" };
const input = () => ({ ...issueBridgeSession(auth, "conversation"), turnId: "turn", generation: 1, transcript: "Merhaba" });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.mocked(classifyConversation).mockResolvedValue(general as never); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("Executive bridge", () => {
  it("reuses the exact canonical constitution", () => expect(REALTIME_BRIDGE_INSTRUCTIONS.startsWith(EXECUTIVE_CONSTITUTION)).toBe(true));
  it("binds credentials to authenticated organization, user and conversation", () => {
    const binding = input();
    expect(verifyBridgeSession(binding.sessionToken, auth).conversationId).toBe("conversation");
    expect(() => verifyBridgeSession(binding.sessionToken, { ...auth, organization: { id: "other" } } as AuthContext)).toThrow();
    expect(() => verifyBridgeSession(binding.sessionToken + "tampered", auth)).toThrow();
  });
  it("routes a confident general turn natively without business execution", async () => {
    expect((await metrixExecutiveTurn(auth, input(), new AbortController().signal)).mode).toBe("GENERAL");
    expect(runExecutiveAgent).not.toHaveBeenCalled();
    expect(lifecycle.persistCanonicalAssistantTurn).not.toHaveBeenCalled();
    expect(lifecycle.persistCanonicalUserTurn).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org", actorUserId: "user" }));
  });
  it("delegates company turns through shared context and existing runtime; persists only core result", async () => {
    vi.mocked(classifyConversation).mockResolvedValue({ ...general, companyRelevance: "high" } as never);
    vi.mocked(runExecutiveAgent).mockResolvedValue({ text: "Authoritative result", stopReason: "completed", structured: null } as never);
    const result = await metrixExecutiveTurn(auth, input(), new AbortController().signal);
    expect(result).toMatchObject({ mode: "COMPANY", executiveResult: "Authoritative result" });
    expect(lifecycle.prepareExecutiveTurnContext).toHaveBeenCalledWith(expect.objectContaining({ authContext: auth, channel: "voice", requestId: "turn" }));
    expect(runExecutiveAgent).toHaveBeenCalledWith({ coreContext: true }, expect.objectContaining({ organizationSummary: "summary", conversationHistory: [] }), expect.any(Function));
    expect(lifecycle.persistCanonicalAssistantTurn).toHaveBeenCalledTimes(1);
    expect(lifecycle.persistCanonicalAssistantTurn).toHaveBeenCalledWith(expect.objectContaining({ content: "Authoritative result", organizationId: "org" }));
  });
  it("does not deliver an Executive result after cancellation", async () => {
    const controller = new AbortController();
    vi.mocked(classifyConversation).mockResolvedValue({ ...general, confidence: "low" } as never);
    vi.mocked(runExecutiveAgent).mockImplementation(async () => { controller.abort(); return { text: "stale", stopReason: "completed" } as never; });
    await expect(metrixExecutiveTurn(auth, input(), controller.signal)).rejects.toThrow();
    expect(lifecycle.persistCanonicalAssistantTurn).not.toHaveBeenCalled();
  });
  it("rejects mismatched conversation before accessing core", async () => {
    await expect(metrixExecutiveTurn(auth, { ...input(), conversationId: "foreign" }, new AbortController().signal)).rejects.toThrow();
    expect(lifecycle.resolveExecutiveConversation).not.toHaveBeenCalled();
  });
});

vi.mock("@/app/api/ai/chat/opening-delivery", async importOriginal => ({
  ...await importOriginal<typeof import("@/app/api/ai/chat/opening-delivery")>(),
  createMetrixOpeningStream: vi.fn(),
}));
import { createMetrixOpeningStream } from "@/app/api/ai/chat/opening-delivery";
it("delivers canonical entry and grounded stages before authoritative completion, then persists only Executive truth", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(classifyConversation).mockResolvedValue({ ...general, companyRelevance: "high" } as never);
  vi.mocked(createMetrixOpeningStream).mockReturnValue({ textStream: (async function* () { yield "Bunu hemen inceleyeyim. "; })() } as never);
  const order: string[] = [];
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  vi.mocked(runExecutiveAgent).mockImplementation(async (_context, value, emit) => {
    expect(value.contextualEntry).toBe("");
    expect(value.concurrentOpening).toBe(true);
    order.push("executive-start");
    await vi.waitFor(() => expect(order).toContain("reaction-delivered"));
    for (const stage of ["finding", "connection", "judgment", "synthesis"] as const)
      emit(`${stage}. `, { stage, evidenceReferences: [] }); // runtime owns evidence validation
    await waiting;
    order.push("authoritative-complete");
    return { text: "Executive truth", stopReason: "completed" } as never;
  });
  const pending = metrixExecutiveTurn(auth, { ...input(), turnId: "timed-turn", transcript: "Satış önceliklerini kapsamlı değerlendir" }, new AbortController().signal,
    event => order.push(event.phase === "opening" ? "reaction-delivered" : event.progressive!.stage));
  await vi.waitFor(() => expect(order).toContain("synthesis"));
  expect(order).toEqual(["reaction-delivered", "executive-start", "finding", "connection", "judgment", "synthesis"]);
  expect(lifecycle.persistCanonicalAssistantTurn).not.toHaveBeenCalled();
  finish();
  expect(await pending).toMatchObject({ executiveResult: "Executive truth" });
  expect(order.at(-1)).toBe("authoritative-complete");
  expect(lifecycle.persistCanonicalAssistantTurn).toHaveBeenCalledWith(expect.objectContaining({ content: "Executive truth" }));
  const marks = () => log.mock.calls.filter(([tag]) => tag === "[voice-latency]").map(([, mark]) => mark).filter(mark => mark.turnId === "timed-turn");
  await vi.waitFor(() => expect(marks().some(m => m.event === "executive_complete")).toBe(true));
  const events = marks().map(m => m.event);
  const position = (event: string) => events.indexOf(event);

  expect(events).toEqual(expect.arrayContaining([
    "opening_start",
    "classification_start",
    "classification_complete",
    "opening_sentence_delivered",
    "executive_start",
    "first_progressive_publish",
    "executive_complete",
  ]));

  // Opening and classification are concurrent. Their completion order is
  // intentionally not fixed; only architectural ownership/order is fixed.
  expect(position("opening_start")).toBeLessThan(position("classification_complete"));
  expect(position("classification_start")).toBeLessThan(position("classification_complete"));
  expect(position("opening_sentence_delivered")).toBeLessThan(position("executive_start"));
  expect(position("classification_complete")).toBeLessThan(position("executive_start"));
  expect(position("executive_start")).toBeLessThan(position("first_progressive_publish"));
  expect(position("first_progressive_publish")).toBeLessThan(position("executive_complete"));
  for (const [index, mark] of marks().entries()) {
    expect(Object.keys(mark).sort()).toEqual(["event", "monotonicMs", "side", "turnId"]);
    expect(mark.turnId).toBe("timed-turn");
    expect(mark.side).toBe("server");
    if (index) expect(mark.monotonicMs).toBeGreaterThanOrEqual(marks()[index - 1].monotonicMs);
  }

});
it("keeps eventual General routing independent from early Natural Reaction", async () => {
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({
    textStream: (async function* () {})(),
  } as never);
  const emit = vi.fn();

  const result = await metrixExecutiveTurn(
    auth,
    input(),
    new AbortController().signal,
    emit,
  );

  expect(result).toMatchObject({ mode: "GENERAL" });
  expect(createMetrixOpeningStream).toHaveBeenCalledTimes(1);
  expect(runExecutiveAgent).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});
it("opening failure does not replace or prevent Executive completion", async () => {
  vi.mocked(classifyConversation).mockResolvedValue({ ...general, companyRelevance: "high" } as never);
  vi.mocked(createMetrixOpeningStream).mockImplementationOnce(() => { throw new Error("opening unavailable"); });
  vi.mocked(runExecutiveAgent).mockResolvedValueOnce({ text: "Core result", stopReason: "completed" } as never);
  const emit = vi.fn();
  expect(await metrixExecutiveTurn(auth, { ...input(), transcript: "Satış önceliklerini değerlendir" }, new AbortController().signal, emit))
    .toMatchObject({ executiveResult: "Core result" });
  expect(emit).not.toHaveBeenCalled();
  expect(runExecutiveAgent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contextualEntry: "" }), expect.any(Function));
});
it("cancellation during opening prevents late entry and Executive start", async () => {
  vi.mocked(classifyConversation).mockResolvedValue({ ...general, companyRelevance: "high" } as never);
  const abort = new AbortController();
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({ textStream: (async function* () {
    abort.abort(); yield "Late reaction. ";
  })() } as never);
  const emit = vi.fn();
  await expect(metrixExecutiveTurn(auth, { ...input(), transcript: "Satış önceliklerini değerlendir" }, abort.signal, emit)).rejects.toThrow();
  expect(emit).not.toHaveBeenCalled();
  expect(runExecutiveAgent).not.toHaveBeenCalled();
});

it.each(["late", "silent", "failed"])("%s opening cannot delay Executive completion or publish after it", async mode => {
  vi.mocked(classifyConversation).mockResolvedValue({ ...general, companyRelevance: "high" } as never);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let settled!: () => void;
  const producerDone = new Promise<void>(resolve => { settled = resolve; });
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({ textStream: (async function* () {
    try {
      await gate;
      if (mode === "failed") throw new Error("late failure");
      if (mode === "late") yield "Geç açılış değerlendirmesi. ";
    } finally { settled(); }
  })() } as never);
  vi.mocked(runExecutiveAgent).mockResolvedValueOnce({ text: "Core result", stopReason: "completed" } as never);
  const emit = vi.fn();
  const result = await metrixExecutiveTurn(auth, { ...input(), transcript: "Satış önceliklerini kapsamlı değerlendir" }, new AbortController().signal, emit);
  expect(result).toMatchObject({ executiveResult: "Core result" });
  expect(runExecutiveAgent).toHaveBeenCalledTimes(1);
  release(); await producerDone;
  await Promise.resolve();
  expect(emit).not.toHaveBeenCalled();
});
it("first progressive speech closes the opening window without delaying any stage", async () => {
  vi.mocked(classifyConversation).mockResolvedValue({ ...general, companyRelevance: "high" } as never);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({ textStream: (async function* () {
    await gate; yield "Geç açılış değerlendirmesi. ";
  })() } as never);
  const events: import("../turn").BridgeSpeechEvent[] = [];
  vi.mocked(runExecutiveAgent).mockImplementationOnce(async (_context, _value, emit) => {
    for (const stage of ["finding", "connection", "judgment", "synthesis"] as const) {
      emit(`${stage}.`, { stage, evidenceReferences: [] });
      release(); await Promise.resolve();
    }
    return { text: "Core result", stopReason: "completed" } as never;
  });
  await metrixExecutiveTurn(auth, { ...input(), transcript: "Satış önceliklerini kapsamlı değerlendir" }, new AbortController().signal, e => events.push(e));
  expect(events.map(e => e.progressive?.stage)).toEqual(["finding", "connection", "judgment", "synthesis"]);
  expect(events.map(e => e.sequence)).toEqual([1, 2, 3, 4]);
});
it("cancellation after concurrent Executive start suppresses late opening and persistence", async () => {
  vi.mocked(classifyConversation).mockResolvedValue({ ...general, companyRelevance: "high" } as never);
  const abort = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({ textStream: (async function* () {
    await gate; yield "Geç açılış değerlendirmesi. ";
  })() } as never);
  vi.mocked(runExecutiveAgent).mockImplementationOnce(async () => {
    abort.abort(); release(); await Promise.resolve();
    return { text: "stale", stopReason: "completed" } as never;
  });
  const emit = vi.fn();
  await expect(metrixExecutiveTurn(auth, { ...input(), transcript: "Satış önceliklerini kapsamlı değerlendir" }, abort.signal, emit)).rejects.toThrow();
  expect(runExecutiveAgent).toHaveBeenCalledTimes(1);
  expect(emit).not.toHaveBeenCalled();
  expect(lifecycle.persistCanonicalAssistantTurn).not.toHaveBeenCalled();
});

it("delivers safe canonical acknowledgement while Company classification is still pending", async () => {
  let classify!: (value: never) => void;
  vi.mocked(classifyConversation).mockReturnValueOnce(new Promise(resolve => { classify = resolve; }));
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({ textStream: (async function* () { yield "Bunu hemen inceleyeyim. "; })() } as never);
  vi.mocked(runExecutiveAgent).mockResolvedValueOnce({ text: "Executive truth", stopReason: "completed" } as never);
  const emit = vi.fn();
  const transcript = "Şirketin mevcut durumunda şu an en çok neye dikkat etmek gerekiyor?";
  const pending = metrixExecutiveTurn(auth, { ...input(), transcript }, new AbortController().signal, emit);
  await vi.waitFor(() => expect(emit).toHaveBeenCalledOnce());
  expect(runExecutiveAgent).not.toHaveBeenCalled();
  expect(createMetrixOpeningStream).toHaveBeenCalledWith(expect.objectContaining({ voiceAcknowledgement: true, message: transcript }));
  expect(emit.mock.calls[0][0]).toMatchObject({ phase: "opening", content: "Bunu hemen inceleyeyim.", sequence: 1 });
  classify({ ...general, companyRelevance: "high" } as never);
  expect(await pending).toMatchObject({ mode: "COMPANY", executiveResult: "Executive truth" });
  expect(classifyConversation).toHaveBeenCalledTimes(1);
  expect(createMetrixOpeningStream).toHaveBeenCalledTimes(1);
  expect(runExecutiveAgent).toHaveBeenCalledTimes(1);
  expect(runExecutiveAgent).toHaveBeenCalledWith({ coreContext: true }, expect.objectContaining({ message: transcript, conversationHistory: [], concurrentOpening: true }), expect.any(Function));
});

it("keeps semantic routing authoritative when early Natural Reaction is silent", async () => {
  let classify!: (value: never) => void;
  vi.mocked(classifyConversation).mockReturnValueOnce(
    new Promise(resolve => { classify = resolve; }),
  );
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({
    textStream: (async function* () {})(),
  } as never);

  const emit = vi.fn();
  const pending = metrixExecutiveTurn(
    auth,
    input(),
    new AbortController().signal,
    emit,
  );

  await vi.waitFor(() => expect(classify).toBeDefined());

  expect(createMetrixOpeningStream).toHaveBeenCalledTimes(1);
  expect(runExecutiveAgent).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();

  classify(general as never);

  expect(await pending).toMatchObject({ mode: "GENERAL" });
  expect(runExecutiveAgent).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});

it.each(["Nakit düşük.", "İşlem tamamlandı.", "Atlas için 4 sipariş var.", "Bunu hemen inceleyeyim. İşlem başarılı."])("rejects unsafe early model output: %s", async content => {
  let classify!: (value: never) => void;
  vi.mocked(classifyConversation).mockReturnValueOnce(new Promise(resolve => { classify = resolve; }));
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({ textStream: (async function* () { yield content; })() } as never);
  const emit = vi.fn();
  const pending = metrixExecutiveTurn(auth, { ...input(), transcript: "Şirketin önceliklerini değerlendir" }, new AbortController().signal, emit);
  await vi.waitFor(() => expect(classify).toBeDefined());
  // A valid first sentence may publish, but no facts or following sentence may escape.
  for (const [event] of emit.mock.calls) expect(event.content).toBe("Bunu hemen inceleyeyim.");
  classify(general as never);
  await pending;
  for (const [event] of emit.mock.calls) expect(event.content).toBe("Bunu hemen inceleyeyim.");
});

it("aborts early opening on classifier failure and suppresses its late output", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(createMetrixOpeningStream).mockReturnValueOnce({ textStream: (async function* () { await gate; yield "Bakıyorum. "; })() } as never);
  vi.mocked(classifyConversation).mockRejectedValueOnce(new Error("classification failed"));
  const emit = vi.fn();
  await expect(metrixExecutiveTurn(auth, { ...input(), transcript: "Şirketin önceliklerini değerlendir" }, new AbortController().signal, emit)).rejects.toThrow("classification failed");
  expect(vi.mocked(createMetrixOpeningStream).mock.calls[0][0].signal.aborted).toBe(true);
  release(); await Promise.resolve(); await Promise.resolve();
  expect(emit).not.toHaveBeenCalled();
  expect(runExecutiveAgent).not.toHaveBeenCalled();
});
