import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  TURN_FAILED_NOTICE,
  TURN_INCOMPLETE_NOTICE,
  interpretMetrixTurnResponse
} from "../../src/lib/metrix-client/turn-response";

const presentation = { type: "ENTITY", title: "Deniz'i ara" };

describe("interpretMetrixTurnResponse", () => {
  it("a normal completed turn keeps its answer, presentation and conversation id", () => {
    const turn = interpretMetrixTurnResponse({
      httpOk: true,
      payload: {
        ok: true,
        conversationId: "conv-1",
        turnResult: { executiveText: "Görev oluşturuldu.", presentations: [presentation] }
      }
    });

    expect(turn).toEqual({
      kind: "completed",
      executiveText: "Görev oluşturuldu.",
      presentation,
      conversationId: "conv-1"
    });
  });

  it("TURN_INCOMPLETE + committed:true yields the canonical presentation and no answer text", () => {
    const turn = interpretMetrixTurnResponse({
      httpOk: false,
      payload: {
        ok: false,
        code: "TURN_INCOMPLETE",
        committed: true,
        turnResult: { executiveText: "", presentations: [presentation] }
      }
    });

    expect(turn).toEqual({ kind: "incomplete_committed", presentation });
    expect("executiveText" in turn).toBe(false);
  });

  it("committed without presentations is still committed (no presentation to show)", () => {
    const turn = interpretMetrixTurnResponse({
      httpOk: false,
      payload: { ok: false, code: "TURN_INCOMPLETE", committed: true, turnResult: { presentations: [] } }
    });

    expect(turn).toEqual({ kind: "incomplete_committed", presentation: null });
  });

  it("nothing but an explicit TURN_INCOMPLETE + committed:true is treated as committed", () => {
    const notCommitted = [
      { ok: false, code: "TURN_INCOMPLETE" },
      { ok: false, code: "TURN_INCOMPLETE", committed: false },
      { ok: false, code: "TURN_INCOMPLETE", committed: "true" },
      { ok: false, code: "INVALID_REQUEST", committed: true },
      { ok: false, code: "UNAUTHENTICATED" },
      { ok: false }
    ];

    for (const payload of notCommitted) {
      expect(interpretMetrixTurnResponse({ httpOk: false, payload })).toEqual({ kind: "failed" });
    }
  });

  it("a non-JSON body (null payload) or non-object is a plain failure, whatever the status", () => {
    for (const payload of [null, undefined, "<html>500</html>", 500]) {
      expect(interpretMetrixTurnResponse({ httpOk: false, payload })).toEqual({ kind: "failed" });
    }
  });

  it("a non-OK HTTP status never completes a turn, even if the body says ok", () => {
    expect(
      interpretMetrixTurnResponse({
        httpOk: false,
        payload: { ok: true, turnResult: { executiveText: "x", presentations: [] } }
      })
    ).toEqual({ kind: "failed" });
  });
});

describe("MetrixConversation wiring", () => {
  const source = readFileSync("src/components/metrix-conversation/MetrixConversation.tsx", "utf8");
  const send = source.slice(source.indexOf("const send = useCallback"), source.indexOf("const startNewConversation"));

  it("parses JSON separately from the HTTP status, so a non-JSON 500 is not 'Bağlantı hatası'", () => {
    expect(send).toMatch(/try \{\s*payload = await response\.json\(\);\s*\} catch \{\s*payload = null;\s*\}/);
    expect(send).toContain("httpOk: response.ok");
    // 'Bağlantı hatası' remains only for a genuinely failed fetch.
    expect(send.match(/Bağlantı hatası/g)).toHaveLength(1);
    expect(send.indexOf("Bağlantı hatası")).toBeGreaterThan(send.indexOf("} catch {\n          setError(\"Bağlantı"));
  });

  it("shows the committed/incomplete status through the runtime-status channel, never as a chat answer", () => {
    const branch = send.slice(
      send.indexOf('turn.kind === "incomplete_committed"'),
      send.indexOf('turn.kind === "failed"')
    );

    expect(branch).toContain("setPresentation(turn.presentation)");
    expect(branch).toContain("setError(TURN_INCOMPLETE_NOTICE)");
    expect(branch).not.toContain("setMessages");
    expect(branch).toContain("return;");
  });

  it("the notice is the exact required text and does not invite a resend", () => {
    expect(TURN_INCOMPLETE_NOTICE).toBe(
      "İşlem kaydedildi ancak yanıt tamamlanamadı. Tekrar göndermenize gerek yok."
    );
    expect(TURN_INCOMPLETE_NOTICE).not.toMatch(/tekrar deneyin/i);
    expect(TURN_FAILED_NOTICE).toBe("METRIX şu anda yanıt veremedi. Tekrar deneyin.");
  });

  it("a committed-incomplete turn does not touch the conversation handle (the server never bound it)", () => {
    const branch = send.slice(
      send.indexOf('turn.kind === "incomplete_committed"'),
      send.indexOf('turn.kind === "failed"')
    );

    expect(branch).not.toContain("conversationIdRef");
    expect(branch).not.toContain("localStorage");
  });

  it("turn identity is per submission (a fresh id each send), never derived from message text, and there is no retry framework", () => {
    expect(send.match(/crypto\.randomUUID\(\)/g)).toHaveLength(1);
    expect(source).not.toMatch(/turnIdByText|lastTurnId|failedTurn|retryTurn|retryRef/);
    // No map/cache keyed by message text anywhere in the send path.
    expect(send).not.toMatch(/new Map|Record<string,\s*string>|\[text\]/);
  });

  it("a committed turn still triggers the immediate notification refresh", () => {
    const branch = send.slice(
      send.indexOf('turn.kind === "incomplete_committed"'),
      send.indexOf('turn.kind === "failed"')
    );

    expect(branch).toContain('"metrix:notifications-refresh"');
  });
});
