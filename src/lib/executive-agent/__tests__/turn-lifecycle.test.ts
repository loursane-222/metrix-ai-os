import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({
  sendUserMessage: vi.fn(), sendAiMessage: vi.fn(), resolveChatConversation: vi.fn(),
  findLastAiMessageByConversation: vi.fn(), listRecentMessagesByConversation: vi.fn(),
}));
vi.mock("@/lib/application/conversations/conversation.service", () => services);
vi.mock("@/lib/core/conversations/conversation.repository", () => services);
import {
  prepareExecutiveTurnContext, buildOrganizationSummary,
  loadExecutiveConversationHistory, buildExecutiveConversationHistory,
  persistCanonicalUserTurn, persistCanonicalAssistantTurn, resolveExecutiveConversation,
} from "../turn-lifecycle";
import { buildOrganizationSummary as originalSummary } from "@/lib/core/organizations/organization-summary";

const route = readFileSync(new URL("../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
afterEach(() => vi.clearAllMocks());
describe("shared canonical turn lifecycle parity", () => {
  it.each(["text", "voice"] as const)("preserves authenticated scope, context and identity for %s", (channel) => {
    const input = {
      authContext: { organization: { id: "org", name: "Atlas", city: "İstanbul" }, user: { id: "user", timezone: "Europe/Istanbul" }, membership: { role: "OWNER" } },
      channel, conversationId: "conversation", requestId: "request", correlationId: "correlation",
      activeDocumentAttachment: null, activeWorkspaceContext: null, message: "Bu turdaki mesaj",
    } as Parameters<typeof prepareExecutiveTurnContext>[0];
    expect(prepareExecutiveTurnContext(input)).toEqual({
      organizationId: "org", actorId: "user", organizationName: "Atlas", role: "OWNER", timeZone: "Europe/Istanbul",
      channel: channel === "voice" ? "voice" : "written", conversationId: "conversation", requestId: "request", correlationId: "correlation",
      authContext: input.authContext, activeDocumentAttachment: null, activeWorkspaceContext: null, currentTurnMessage: input.message,
    });
    expect(buildOrganizationSummary).toBe(originalSummary);
    expect(buildOrganizationSummary(input.authContext.organization)).toBe("Atlas — İstanbul");
  });

  it("loads the same scoped history in parallel and preserves roles, content and order", async () => {
    const last = { id: "last", metadata: { previous: true } };
    const messages = [{ senderType: "USER", content: " ilk " }, { senderType: "SYSTEM", content: "skip" }, { senderType: "AI", content: "yanıt" }];
    services.findLastAiMessageByConversation.mockResolvedValue(last);
    services.listRecentMessagesByConversation.mockResolvedValue(messages);
    const pending = loadExecutiveConversationHistory({ conversationId: "c", organizationId: "o", limit: 20 });
    expect(services.findLastAiMessageByConversation).toHaveBeenCalledWith("c", "o");
    expect(services.listRecentMessagesByConversation).toHaveBeenCalledWith("c", 20, "o");
    expect(await pending).toEqual([last, messages]);
    expect(buildExecutiveConversationHistory(messages)).toEqual([{ role: "user", content: " ilk " }, { role: "assistant", content: "yanıt" }]);
    expect(buildExecutiveConversationHistory([])).toEqual([]);
  });

  it("propagates history failure without fallback or retries", async () => {
    const error = new Error("repository unavailable");
    services.findLastAiMessageByConversation.mockRejectedValueOnce(error);
    services.listRecentMessagesByConversation.mockResolvedValueOnce([]);
    await expect(loadExecutiveConversationHistory({ conversationId: "c", organizationId: "o", limit: 20 })).rejects.toBe(error);
    expect(services.findLastAiMessageByConversation).toHaveBeenCalledTimes(1);
  });

  it("uses the original canonical persistence functions without wrapping their promises or changing arguments", () => {
    expect(persistCanonicalUserTurn).toBe(services.sendUserMessage);
    expect(persistCanonicalAssistantTurn).toBe(services.sendAiMessage);
    expect(resolveExecutiveConversation).toBe(services.resolveChatConversation);
    for (const [persist, service] of [[persistCanonicalUserTurn, services.sendUserMessage], [persistCanonicalAssistantTurn, services.sendAiMessage]] as const) {
      const input = { organizationId: "o", conversationId: "c", actorUserId: "u", content: " exact ", metadata: { sourceMessageId: "id", readback: "PASSED" } };
      const promise = Promise.resolve({ id: "unchanged-id" });
      service.mockReturnValueOnce(promise);
      expect(persist(input)).toBe(promise);
      expect(service.mock.calls.at(-1)?.[0]).toBe(input);
    }
  });

  it("preserves persistence metadata/error handling and the complete Agent invocation from before extraction", () => {
    // Pre-R3 hashes, not recomputed from the new implementation.
    for (const [start, end, expected] of [
      ["    const userMessagePromise = sendUserMessage({", "    type CaptureResult", "6ea148d09fa0e6018daaa0488146b23fedbe50acadb9eee56e2d86144a4bdde4"],
      ["          await sendAiMessage({", '          profiler.markEnd("ai_message_write")', "115d7e7d6233cddec8d496a42895ac8d6dfb5f20dd4c9ac9c044d642cefc1dc1"],
      ["            agentRunResult = await runExecutiveAgent(", "            if (agentRunResult.stopReason", "61cecdf26f73d91b852c1c3ad288683544f6b8d653b8ef5830f07783dbab0356"],
    ]) {
      const from = route.indexOf(start);
      expect(from).toBeGreaterThan(-1);
      expect(createHash("sha256").update(route.slice(from, route.indexOf(end, from))).digest("hex")).toBe(expected);
    }
  });

  it("keeps the HTTP adapter, no-history branch and done/close/persistence ordering", () => {
    expect(route).toContain('from "@/lib/executive-agent/turn-lifecycle"');
    expect(route).toContain("= prepareExecutiveTurnContext({");
    expect(route).toContain("= conversationId ? await loadExecutiveConversationHistory({");
    expect(route).toContain("}) : [null, []];");
    expect(route.match(/new ReadableStream</g)).toHaveLength(1);
    expect(route.match(/new Response\(readableStream/g)).toHaveLength(1);
    const done = route.indexOf('type: "done",');
    const close = route.indexOf("controller.close();", done);
    expect(close).toBeGreaterThan(done);
    expect(route.indexOf("await sendAiMessage({", close)).toBeGreaterThan(close);
    expect(route).toContain("contextualEntry, signal: deliveryAbort.signal");
  });
});
