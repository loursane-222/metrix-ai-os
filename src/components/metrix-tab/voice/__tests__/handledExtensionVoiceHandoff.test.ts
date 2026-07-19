import { describe, expect, it, vi } from "vitest";
import { handoffHandledExtensionVoice } from "../handledExtensionVoiceHandoff";

describe("handled extension voice handoff", () => {
  it.each([
    ["written", "Yanıt", false, false],
    ["voice", "Yanıt", false, true],
    ["voice", null, false, false],
    ["voice", "Yanıt", true, false],
  ] as const)("coordinates source=%s message=%s duplicate=%s", (source, message, duplicate, expected) => {
    const speak = vi.fn(); const suppress = vi.fn();
    expect(handoffHandledExtensionVoice({ source, message, duplicate, nativeRealtime: false, suppressNativeAssistant: suppress, speakDeterministicResponse: speak })).toBe(expected);
    expect(speak).toHaveBeenCalledTimes(expected ? 1 : 0); expect(suppress).not.toHaveBeenCalled();
  });
  it("suppresses native assistant and speaks the deterministic message exactly once", () => {
    const speak = vi.fn(); const suppress = vi.fn();
    handoffHandledExtensionVoice({ source: "voice", message: "Arda Yapı taslağa eklendi.", duplicate: false, nativeRealtime: true, suppressNativeAssistant: suppress, speakDeterministicResponse: speak });
    expect(suppress).toHaveBeenCalledTimes(1); expect(speak).toHaveBeenCalledTimes(1);
  });
});
