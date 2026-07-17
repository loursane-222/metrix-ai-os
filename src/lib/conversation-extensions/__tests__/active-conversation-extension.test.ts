import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock, getActiveScopeKeyMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  getActiveScopeKeyMock: vi.fn(),
}));

vi.mock("../customer-edit-conversation-extension", () => ({
  customerEditConversationExtension: {
    execute: executeMock,
    getActiveScopeKey: getActiveScopeKeyMock,
  },
}));

import {
  executeActiveConversationExtension,
  resetConversationExtensionTurnCacheForTests,
} from "../active-conversation-extension";

describe("executeActiveConversationExtension", () => {
  beforeEach(() => {
    getActiveScopeKeyMock.mockReturnValue("customer-edit:surface_1:cust_1");
    executeMock.mockResolvedValue({ status: "HANDLED_EXECUTED", message: "Uygulandi." });
  });

  afterEach(() => {
    resetConversationExtensionTurnCacheForTests();
    vi.clearAllMocks();
  });

  it("returns NOT_HANDLED without invoking an extension when no supported surface is active", async () => {
    getActiveScopeKeyMock.mockReturnValue(null);

    await expect(
      executeActiveConversationExtension({ utterance: "Merhaba", source: "written", turnKey: "turn-1" }),
    ).resolves.toEqual({ status: "NOT_HANDLED", message: null, duplicate: false });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["HANDLED_EXECUTED", "Kaydedildi."],
    ["HANDLED_CLARIFICATION", "Hangi alan?"],
    ["HANDLED_FAILED", "Islem basarisiz."],
  ] as const)("returns %s as handled so the caller can suppress normal chat", async (status, message) => {
    executeMock.mockResolvedValue({ status, message });

    const result = await executeActiveConversationExtension({ utterance: "Komut", source: "written", turnKey: status });

    expect(result).toEqual({ status, message, duplicate: false });
  });

  it("lets unsupported utterances continue through normal chat", async () => {
    executeMock.mockResolvedValue({ status: "NOT_HANDLED", message: null });

    await expect(
      executeActiveConversationExtension({ utterance: "Hava nasil?", source: "written", turnKey: "unsupported" }),
    ).resolves.toEqual({ status: "NOT_HANDLED", message: null, duplicate: false });
  });

  it("resolves and dispatches only once when the same explicit turnKey arrives twice concurrently", async () => {
    const first = executeActiveConversationExtension({ utterance: "Kaydet", source: "voice", turnKey: "voice-final-1" });
    const second = executeActiveConversationExtension({ utterance: "Kaydet", source: "voice", turnKey: "voice-final-1" });

    expect(await first).toMatchObject({ status: "HANDLED_EXECUTED", duplicate: false });
    expect(await second).toMatchObject({ status: "HANDLED_EXECUTED", duplicate: true });
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("executes the same utterance again for a different real turnKey", async () => {
    await executeActiveConversationExtension({ utterance: "Kaydet", source: "written", turnKey: "turn-1" });
    await executeActiveConversationExtension({ utterance: "Kaydet", source: "written", turnKey: "turn-2" });

    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("uses the same dispatcher for written and voice while keeping their fallback turns distinct", async () => {
    await executeActiveConversationExtension({ utterance: "Resmi bilgiler", source: "written" });
    await executeActiveConversationExtension({ utterance: "Resmi bilgiler", source: "voice" });

    expect(executeMock).toHaveBeenCalledTimes(2);
  });
});
