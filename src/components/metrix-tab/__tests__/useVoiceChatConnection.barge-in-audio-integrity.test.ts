import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Barge-in STT accuracy fix — investigation confirmed no evidence of
// input-audio-buffer or mic-track loss at the start of a barge-in utterance
// (see voice/session/route.ts's transcription comment for the full root
// cause). These tests pin that finding as a regression guard, without
// modifying useVoiceChatConnection.ts itself: "input_audio_buffer.clear" is
// sent from exactly one place (muting right after the user's OWN final
// transcript, before Metrix's turn starts), and neither the barge-in cancel
// path (cancelActiveResponse) nor the barge-in onset event
// (input_audio_buffer.speech_started) ever clears the buffer or disables the
// mic track — so the first word of a genuine barge-in is never dropped by
// this file's own logic.
const source = readFileSync(
  join(__dirname, "../useVoiceChatConnection.ts"),
  "utf-8",
);

describe("barge-in audio-buffer integrity (regression pin, no source changes)", () => {
  it("input_audio_buffer.clear is sent from exactly one place in the whole file", () => {
    const occurrences = source.match(/input_audio_buffer\.clear/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it("cancelActiveResponse (the barge-in response.cancel path) never clears the input buffer or mutes the mic", () => {
    const start = source.indexOf("const cancelActiveResponse = useCallback(() => {");
    const end = source.indexOf("const stop = useCallback(() => {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body).not.toContain("input_audio_buffer.clear");
    expect(body).not.toContain("muteInput(");
    expect(body).not.toContain(".enabled = false");
  });

  it("the speech_started handler (barge-in onset) never clears the input buffer or disables the mic track", () => {
    const start = source.indexOf('if (event.type === "input_audio_buffer.speech_started")');
    const end = source.indexOf('if (event.type === "input_audio_buffer.speech_stopped")', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body).not.toContain("input_audio_buffer.clear");
    expect(body).not.toContain("muteInput(");
    expect(body).not.toContain(".enabled = false");
  });

  it("the mic MediaStreamTrack itself is never disabled anywhere (barge-in must keep hearing real audio, not silence)", () => {
    expect(source).not.toContain(".enabled = false");
  });
});
