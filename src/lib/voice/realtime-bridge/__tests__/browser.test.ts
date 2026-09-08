import { afterEach, expect, it, vi } from "vitest";
import { RealtimeBridge, TurnOwner, spokenResponse, type SpokenTurn, type BridgeAcceptanceOptions } from "../browser";
const binding = { sessionId: "session", conversationId: "conversation", sessionToken: "signed" };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("invalidates prior generation and aborts its HTTP request", () => {
  const owner = new TurnOwner(binding), first = owner.begin(), signal = owner.pending!.signal;
  const second = owner.begin();
  expect(signal.aborted).toBe(true); expect(owner.owns(first)).toBe(false); expect(owner.owns(second)).toBe(true);
  expect(owner.owns({ ...second, conversationId: "other" })).toBe(false);
});
it("general and company response requests have no business tools and retain authority envelope", () => {
  for (const mode of ["GENERAL", "COMPANY"] as const) {
    const event = spokenResponse({ ...binding, turnId: "t", generation: 1, mode, executiveResult: "core" }, "question", []);
    expect(event).toMatchObject({ type: "response.create", response: { tools: [], conversation: "none", metadata: { turnId: "t", generation: "1" } } });
    expect(JSON.stringify(event).includes('executiveResult')).toBe(mode === "COMPANY");
  }
});
it("boots WebRTC, routes one final transcript, captures only owned spoken output and cuts audio on barge-in", async () => {
  const send = vi.fn();
  const dc = { readyState: "open", send, close: vi.fn() };
  const pc = { createDataChannel: vi.fn(() => dc), addTrack: vi.fn(), createOffer: vi.fn().mockResolvedValue({ sdp: "offer" }), setLocalDescription: vi.fn(), setRemoteDescription: vi.fn(), close: vi.fn() };
  const track = { stop: vi.fn() };
  vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return pc; }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/session")) return Response.json({ ok: true, data: { bridge: binding, clientSecret: { value: "ephemeral" } } });
    if (url.endsWith("/calls")) return new Response("answer");
    const body = JSON.parse(String(init?.body));
    return Response.json({ ok: true, data: { ...body, mode: "GENERAL" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const audio = { muted: false, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), srcObject: null };
  let turns: SpokenTurn[] = [];
  const bridge = new RealtimeBridge(audio as unknown as HTMLAudioElement, { turns: t => { turns = t; }, status: vi.fn(), classify: () => "user_speech" });
  await bridge.start();
  expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "answer" });
  const receive = (event: unknown) => bridge.receive(event as never);
  const final = { type: "conversation.item.input_audio_transcription.completed", item_id: "item", transcript: "Merhaba" };
  await receive(final); await receive(final);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/turn"))).toHaveLength(1);
  const created = JSON.parse(send.mock.calls.at(-1)![0]);
  await receive({ type: "response.created", response: { id: "r", metadata: created.response.metadata } });
  expect(audio.play).toHaveBeenCalledOnce();
  await receive({ type: "response.output_audio_transcript.delta", response_id: "r", delta: "Merhaba." });
  expect(turns[0].assistant).toBe("Merhaba.");
  await receive({ type: "input_audio_buffer.speech_started", item_id: "new" });
  expect(audio.muted).toBe(true); expect(audio.pause).toHaveBeenCalled();
  await receive({ type: "response.output_audio_transcript.delta", response_id: "r", delta: "stale" });
  expect(turns[0].assistant).toBe("Merhaba.");
  expect(send.mock.calls.map(([s]) => JSON.parse(s).type)).toContain("output_audio_buffer.clear");
  await receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "new", transcript: "Huh." });
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/turn"))).toHaveLength(2);
  expect(turns).toHaveLength(2);
  expect(turns[0].turnId).not.toBe(turns[1].turnId);
  expect(track.stop).not.toHaveBeenCalled();
  bridge.close(); expect(track.stop).toHaveBeenCalled();
});
it("never requests native speech for an Executive result that resolves after barge-in", async () => {
  const send = vi.fn();
  const pc = { createDataChannel: () => ({ readyState: "open", send, close: vi.fn() }), addTrack: vi.fn(), createOffer: async () => ({ sdp: "offer" }), setLocalDescription: vi.fn(), setRemoteDescription: vi.fn(), close: vi.fn() };
  vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return pc; }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } });
  let finish!: (response: Response) => void;
  let requestBody: Record<string, unknown> = {};
  let started!: () => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/session")) return Response.json({ ok: true, data: { bridge: binding, clientSecret: { value: "ephemeral" } } });
    if (url.endsWith("/calls")) return new Response("answer");
    requestBody = JSON.parse(String(init?.body)); started();
    return new Promise<Response>(resolve => { finish = resolve; });
  }));
  const audio = { muted: false, pause: vi.fn(), play: vi.fn(), srcObject: null };
  const bridge = new RealtimeBridge(
    audio as unknown as HTMLAudioElement,
    { turns: vi.fn(), status: vi.fn(), classify: () => "user_speech" },
    { naturalConversation: false },
  );
  await bridge.start();
  const turn = bridge.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "i", transcript: "Company priority?" } as never);
  await startedPromise;
  bridge.interrupt();
  finish(Response.json({ ok: true, data: { ...requestBody, mode: "COMPANY", executiveResult: "stale result" } }));
  await turn;
  expect(send.mock.calls.map(([s]) => JSON.parse(s).type)).not.toContain("response.create");
  bridge.close();
});

async function streamingBridge(acceptance: BridgeAcceptanceOptions = {}) {
  const send = vi.fn();
  const pc = { createDataChannel: () => ({ readyState: "open", send, close: vi.fn() }), addTrack: vi.fn(), createOffer: async () => ({ sdp: "offer" }), setLocalDescription: vi.fn(), setRemoteDescription: vi.fn(), close: vi.fn() };
  vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return pc; }));
  const track = { enabled: true, stop: vi.fn() };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let identity: Record<string, unknown> = {};
  let turnSignal: AbortSignal | undefined;
  const turns = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/session")) return Response.json({ ok: true, data: { bridge: binding, clientSecret: { value: "ephemeral" } } });
    if (url.endsWith("/calls")) return new Response("answer");
    identity = JSON.parse(String(init?.body));
    turnSignal = init?.signal as AbortSignal;
    return new Response(new ReadableStream({ start(c) { controller = c; } }), { headers: { "content-type": "application/x-ndjson" } });
  }));
  const audio = { muted: true, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined), srcObject: null };
  const bridge = new RealtimeBridge(
    audio as unknown as HTMLAudioElement,
    { turns, status: vi.fn(), classify: () => "user_speech" },
    { naturalConversation: false, ...acceptance },
  );
  await bridge.start();
  const pending = bridge.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "i", transcript: "Şirketin önceliklerini değerlendir" } as never);
  await vi.waitFor(() => expect(controller).toBeDefined());
  const emit = (event: object) => controller.enqueue(new TextEncoder().encode(JSON.stringify({ ...identity, ...event }) + "\n"));
  const created = () => send.mock.calls.map(([s]) => JSON.parse(s)).filter(e => e.type === "response.create");
  const receive = (event: unknown) => bridge.receive(event as never);
  return { bridge, audio, emit, created, receive, pending, identity, controller, pc, track, turns, send, turnSignal };
}
it.each([false, true])("speaks entry/progressive/final output without replay (single-turn acceptance: %s)", async singleTurnAcceptance => {
  const h = await streamingBridge({ singleTurnAcceptance });
  if (singleTurnAcceptance) {
    expect(h.track.enabled).toBe(false);
    expect(h.track.stop).toHaveBeenCalledOnce();
    await h.receive({ type: "input_audio_buffer.speech_started", item_id: "noise" });
    await h.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "noise", transcript: "Huh." });
    expect(h.turnSignal?.aborted).toBe(false);
  } else {
    expect(h.track.enabled).toBe(true);
    expect(h.track.stop).not.toHaveBeenCalled();
  }
  h.emit({ type: "chunk", phase: "opening", sequence: 1, content: "Reaction." });
  await vi.waitFor(() => expect(h.created()).toHaveLength(1));
  const first = h.created()[0];
  expect(first.response.tools).toEqual([]);
  expect(first.response.instructions).toContain("aynen seslendir");
  await h.receive({ type: "response.created", response: { id: "r1", metadata: first.response.metadata } });
  expect(h.audio.play).toHaveBeenCalledOnce();
  if (singleTurnAcceptance) {
    const pauses = h.audio.pause.mock.calls.length;
    await h.receive({ type: "input_audio_buffer.speech_started", item_id: "noise-during-output" });
    await h.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "noise-during-output", transcript: "Huh." });
    expect(h.audio.pause).toHaveBeenCalledTimes(pauses);
    expect(h.audio.muted).toBe(false);
  }
  h.emit({ type: "chunk", phase: "primary", sequence: 2, content: "Finding. ", progressive: { stage: "finding" } });
  h.emit({ type: "chunk", phase: "primary", sequence: 2, content: "Finding. " }); // duplicate envelope
  await h.receive({ type: "response.done", response: { id: "r1", status: "completed" } });
  expect(h.created()).toHaveLength(1); // model completion is not playback completion
  await h.receive({ type: "output_audio_buffer.stopped", response_id: "r1" });
  await vi.waitFor(() => expect(h.created()).toHaveLength(2));
  expect(JSON.stringify(h.created()[1])).toContain("Finding.");
  h.emit({ type: "done", data: { ...h.identity, mode: "COMPANY", executiveResult: "Finding. " } });
  h.controller.close(); await h.pending;
  const second = h.created()[1];
  await h.receive({ type: "response.created", response: { id: "r2", metadata: second.response.metadata } });
  await h.receive({ type: "output_audio_buffer.stopped", response_id: "r2" });
  await h.receive({ type: "response.done", response: { id: "r2", status: "completed" } });
  expect(h.created()).toHaveLength(2);
  expect(h.audio.play).toHaveBeenCalledTimes(2);
  expect(h.turnSignal?.aborted).toBe(false);
  expect(h.pc.close).not.toHaveBeenCalled();
  if (singleTurnAcceptance) {
    await h.receive({ type: "input_audio_buffer.speech_started", item_id: "after-completion" });
    await h.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "after-completion", transcript: "Huh." });
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/turn"))).toHaveLength(1);
    expect(h.turns.mock.calls.at(-1)![0]).toHaveLength(1);
    expect(h.send.mock.calls.map(([value]) => JSON.parse(value).type)).not.toContain("response.cancel");
    expect(h.send.mock.calls.map(([value]) => JSON.parse(value).type)).not.toContain("output_audio_buffer.clear");
  }
  h.bridge.close();
});
it("drops queued and late stream speech on barge-in including a late response.created", async () => {
  const h = await streamingBridge();
  h.emit({ type: "chunk", phase: "opening", sequence: 1, content: "Reaction." });
  h.emit({ type: "chunk", phase: "primary", sequence: 2, content: "Finding. " });
  await vi.waitFor(() => expect(h.created()).toHaveLength(1));
  const first = h.created()[0];
  await h.receive({ type: "input_audio_buffer.speech_started", item_id: "new" });
  await h.receive({ type: "response.created", response: { id: "late", metadata: first.response.metadata } });
  h.emit({ type: "done", data: { ...h.identity, mode: "COMPANY", executiveResult: "Finding." } });
  await h.pending;
  expect(h.created()).toHaveLength(1);
  expect(h.audio.play).not.toHaveBeenCalled();
  expect(h.audio.muted).toBe(true);
  h.bridge.close();
});

it("records owned PCM separately from playback requests, with timing-only correlated marks", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  let energy = 0;
  const context = { state: "running", createAnalyser: () => ({ fftSize: 256,
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(energy) }),
    createMediaStreamSource: () => ({ connect: vi.fn() }), resume: async () => {}, close: vi.fn(async () => {}) };
  vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
  const h = await streamingBridge();
  vi.useFakeTimers();
  (h.pc as unknown as { ontrack: (event: unknown) => void }).ontrack({ streams: [{}] });
  Object.assign(h.audio, { paused: false, volume: 1 });
  h.emit({ type: "chunk", phase: "opening", sequence: 1, content: "SECRET REACTION." });
  await vi.advanceTimersByTimeAsync(20);
  await h.receive({ type: "response.created", response: { id: "owned", metadata: h.created()[0].response.metadata } });
  const marks = () => log.mock.calls.filter(([tag]) => tag === "[voice-latency]").map(([, mark]) => mark);
  await vi.advanceTimersByTimeAsync(20);
  expect(marks().some(m => m.event === "first_audible_pcm")).toBe(false);
  await h.receive({ type: "output_audio_buffer.started", response_id: "stale" });
  expect(marks().some(m => m.event === "first_realtime_audio_event")).toBe(false);
  await h.receive({ type: "output_audio_buffer.started", response_id: "owned" });
  await vi.advanceTimersByTimeAsync(20);
  expect(marks().some(m => m.event === "first_audible_pcm")).toBe(false); // silence
  energy = 0.1;
  h.audio.muted = true;
  await vi.advanceTimersByTimeAsync(20);
  expect(marks().some(m => m.event === "first_audible_pcm")).toBe(false);
  h.audio.muted = false;
  await vi.advanceTimersByTimeAsync(30);
  expect(marks().filter(m => m.event === "first_audible_pcm")).toHaveLength(1);
  h.emit({ type: "chunk", phase: "primary", sequence: 2, content: "SECRET FINDING. " });
  h.emit({ type: "chunk", phase: "primary", sequence: 2, content: "SECRET FINDING. " });
  h.emit({ type: "done", data: { ...h.identity, mode: "COMPANY", executiveResult: "SECRET RESULT" } });
  h.controller.close(); await h.pending;
  await vi.advanceTimersByTimeAsync(20);
  expect(marks().filter(m => m.event === "first_progressive_chunk_received")).toHaveLength(1);
  expect(marks().filter(m => m.event === "authoritative_result_received")).toHaveLength(1);
  for (const mark of marks()) {
    expect(Object.keys(mark).sort()).toEqual(["event", "monotonicMs", "side", "turnId"]);
    expect(mark.turnId).toBe(h.identity.turnId);
    expect(Number.isFinite(mark.monotonicMs)).toBe(true);
  }
  expect(JSON.stringify(marks())).not.toContain("SECRET");
  h.bridge.interrupt();
  const count = marks().length;
  await h.receive({ type: "output_audio_buffer.started", response_id: "owned" });
  await vi.advanceTimersByTimeAsync(20);
  expect(marks()).toHaveLength(count);
  h.bridge.close();
  expect(context.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])("preserves classified General after early acknowledgement (barge-in: %s)", async interrupted => {
  const h = await streamingBridge();
  h.emit({ type: "chunk", phase: "opening", sequence: 1, content: "Bakıyorum." });
  await vi.waitFor(() => expect(h.created()).toHaveLength(1));
  await h.receive({ type: "response.created", response: { id: "opening", metadata: h.created()[0].response.metadata } });
  h.emit({ type: "done", data: { ...h.identity, mode: "GENERAL" } });
  h.controller.close(); await h.pending;
  expect(h.created()).toHaveLength(1);
  if (interrupted) await h.receive({ type: "input_audio_buffer.speech_started", item_id: "new" });
  await h.receive({ type: "response.done", response: { id: "opening", status: "completed" } });
  await h.receive({ type: "output_audio_buffer.stopped", response_id: "opening" });
  expect(h.created()).toHaveLength(interrupted ? 1 : 2);
  if (!interrupted) {
    expect(h.created()[1].response.tools).toEqual([]);
    expect(JSON.stringify(h.created()[1])).toContain('GENERAL');
    expect(JSON.stringify(h.created()[1])).toContain('Şirketin önceliklerini değerlendir');
  }
  h.bridge.close();
});

it("starts Natural Conversation immediately, keeps zero tools, then hands General off after audible drain", async () => {
  const send = vi.fn();
  const pc = {
    createDataChannel: () => ({ readyState: "open", send, close: vi.fn() }),
    addTrack: vi.fn(),
    createOffer: async () => ({ sdp: "offer" }),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    close: vi.fn(),
  };

  vi.stubGlobal("RTCPeerConnection", vi.fn(function () { return pc; }));
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ enabled: true, stop: vi.fn() }],
      }),
    },
  });

  let finishTurn!: (response: Response) => void;
  let requestBody: Record<string, unknown> = {};

  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/session")) {
      return Response.json({
        ok: true,
        data: { bridge: binding, clientSecret: { value: "ephemeral" } },
      });
    }

    if (url.endsWith("/calls")) return new Response("answer");

    requestBody = JSON.parse(String(init?.body));

    return new Promise<Response>(resolve => {
      finishTurn = resolve;
    });
  }));

  const audio = {
    muted: true,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    srcObject: null,
  };

  const bridge = new RealtimeBridge(
    audio as unknown as HTMLAudioElement,
    { turns: vi.fn(), status: vi.fn(), classify: () => "user_speech" },
  );

  await bridge.start();

  const pending = bridge.receive({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "natural",
    transcript: "Bana iyi bir liderlik önerisi verir misin?",
  } as never);

  await vi.waitFor(() => {
    const created = send.mock.calls
      .map(([value]) => JSON.parse(value))
      .filter(event => event.type === "response.create");

    expect(created).toHaveLength(1);
  });

  const first = send.mock.calls
    .map(([value]) => JSON.parse(value))
    .find(event => event.type === "response.create");

  expect(first.response.tools).toEqual([]);
  expect(first.response.metadata.naturalConversation).toBe("true");
  expect(first.response.instructions).toContain("doğal bir insan konuşması");

  await bridge.receive({
    type: "response.created",
    response: {
      id: "natural-r1",
      metadata: first.response.metadata,
    },
  } as never);

  finishTurn(Response.json({
    ok: true,
    data: {
      ...requestBody,
      mode: "GENERAL",
    },
  }));

  await pending;

  let created = send.mock.calls
    .map(([value]) => JSON.parse(value))
    .filter(event => event.type === "response.create");

  expect(created).toHaveLength(1);

  await bridge.receive({
    type: "response.done",
    response: {
      id: "natural-r1",
      status: "completed",
    },
  } as never);

  await bridge.receive({
    type: "output_audio_buffer.stopped",
    response_id: "natural-r1",
  } as never);

  created = send.mock.calls
    .map(([value]) => JSON.parse(value))
    .filter(event => event.type === "response.create");

  expect(created).toHaveLength(2);
  expect(created[1].response.tools).toEqual([]);
  expect(created[1].response.metadata.naturalConversation).toBeUndefined();

  bridge.close();
});
