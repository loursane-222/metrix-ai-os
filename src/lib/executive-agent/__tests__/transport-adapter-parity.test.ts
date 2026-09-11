import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { EXECUTIVE_CONSTITUTION } from "../constitution";
import { PROGRESSIVE_DELIVERY_INSTRUCTIONS } from "../progressive-delivery";

const services = vi.hoisted(() => ({
  sendUserMessage: vi.fn(), sendAiMessage: vi.fn(), resolveChatConversation: vi.fn(),
  findLastAiMessageByConversation: vi.fn(), listRecentMessagesByConversation: vi.fn(),
}));
vi.mock("@/lib/application/conversations/conversation.service", () => services);
vi.mock("@/lib/core/conversations/conversation.repository", () => services);
import * as lifecycle from "../turn-lifecycle";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const parse = (source: string) => ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true);
const route = parse(read("../../../app/api/ai/chat/route.ts"));
const runtime = parse(read("../runtime.ts"));
const assembly = parse(read("../assembly.ts"));
function find(file: ts.SourceFile, predicate: (node: ts.Node) => boolean): ts.Node {
  let result: ts.Node | undefined;
  const visit = (node: ts.Node) => { if (!result && predicate(node)) result = node; ts.forEachChild(node, visit); };
  visit(file);
  if (!result) throw new Error("Production expression missing");
  return result;
}
const initializer = (name: string) => (find(route, n => ts.isVariableDeclaration(n) && n.name.getText(route) === name) as ts.VariableDeclaration).initializer!.getText(route);
const call = (file: ts.SourceFile, name: string) => find(file, n => ts.isCallExpression(n) && n.expression.getText(file) === name) as ts.CallExpression;
function evaluate(code: string, scope: Record<string, unknown>) {
  const js = ts.transpileModule(`async function evaluate() { return (${code}); }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${js}; return evaluate();`)(...Object.values(scope));
}
// Execute the production assembly bodies; replace only tool implementation
// factories with inert descriptors. No model, database or tool action executes.
const assemblyScope: Record<string, unknown> = { EXECUTIVE_CONSTITUTION, PROGRESSIVE_DELIVERY_INSTRUCTIONS };
for (const node of assembly.statements) {
  if (!ts.isImportDeclaration(node) || !node.moduleSpecifier.getText(assembly).includes("./tools/")) continue;
  const bindings = node.importClause!.namedBindings as ts.NamedImports;
  for (const binding of bindings.elements) {
    const name = binding.name.text;
    assemblyScope[name] = (...args: unknown[]) => ({ builder: name, args });
  }
}
const declarations = assembly.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(assembly).replace(/^export /, "")).join("\n");
const assemblyJs = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const shared = new Function(...Object.keys(assemblyScope), `${assemblyJs}; return {buildExecutiveInstructions, buildExecutiveTools};`)(...Object.values(assemblyScope));

describe("transport-independent Executive turn contract", () => {
  it("matches production text-adapter expressions against a transport-neutral adapter", async () => {
    const authContext = { organization: { id: "org", name: "Atlas", city: "İstanbul" }, user: { id: "user", timezone: "Europe/Istanbul" }, membership: { role: "OWNER" } };
    const history = [{ senderType: "USER", content: " önceki soru " }, { senderType: "SYSTEM", content: "omit" }, { senderType: "AI", content: "önceki cevap" }];
    const last = { id: "last", metadata: { previous: true } };
    services.findLastAiMessageByConversation.mockResolvedValue(last);
    services.listRecentMessagesByConversation.mockResolvedValue(history);
    services.sendUserMessage.mockImplementation(input => Promise.resolve({ id: "user-message", ...input }));
    services.sendAiMessage.mockImplementation(input => Promise.resolve({ id: "assistant-message", ...input }));
    const input = { authContext, channel: "text" as const, conversationId: "conversation", requestId: "request", correlationId: "turn-correlation", activeDocumentAttachment: null, activeWorkspaceContext: null, message: "Önceliğimiz ne?" };
    const metadata = { evidence: "canonical", sourceMessageId: "user-message" };
    const scope = {
      ...lifecycle, ...shared, ...input, conversation: { id: input.conversationId }, CHAT_HISTORY_MESSAGE_LIMIT: 12,
      recentConversationMessages: history, aiContent: "Canonical assistant result", aiResponse: {}, memoryUpdateCandidates: { created: 0 },
      previousRecentlyAskedKeys: [], cognitionObservation: null, postStreamIntelligence: null, executiveBrainShadow: null,
      executiveAssessment: null, captureActivation: null, conversationTurnArtifacts: [], previousLastOperationContext: null,
      lastSuccessfulOperationContext: null, degradedSignals: new Set(),
      buildAiMessageMetadata: () => metadata, buildNextRecentlyAskedKeys: () => [],
      summarizeExecutiveAssessmentForPersistence: () => null, captureActivationMetadata: () => null,
    };
    // Left side evaluates the actual route initializers and persistence payloads.
    const textContext = await evaluate(initializer("executiveAgentRunContext"), scope);
    const textHistory = await evaluate(initializer("[lastAiMessage, recentConversationMessages]"), scope);
    const textMapped = await evaluate(initializer("conversationHistory"), scope);
    const textSummary = await evaluate(initializer("executiveAgentOrganizationSummary"), scope);
    const userPayload = await evaluate(call(route, "sendUserMessage").arguments[0].getText(route), scope);
    const assistantPayload = await evaluate(call(route, "sendAiMessage").arguments[0].getText(route), scope);
    // Right side has no Request, Response, controller or HTTP lifecycle.
    const neutralContext = lifecycle.prepareExecutiveTurnContext(input as Parameters<typeof lifecycle.prepareExecutiveTurnContext>[0]);
    const neutralHistory = await lifecycle.loadExecutiveConversationHistory({ conversationId: input.conversationId, organizationId: authContext.organization.id, limit: 12 });
    expect(textContext).toEqual(neutralContext);
    expect(textContext.authContext).toBe(authContext);
    expect(textHistory).toEqual(neutralHistory);
    expect(textMapped).toEqual(lifecycle.buildExecutiveConversationHistory(neutralHistory[1]));
    expect(textMapped).toEqual([{ role: "user", content: " önceki soru " }, { role: "assistant", content: "önceki cevap" }]);
    expect(textSummary).toBe(lifecycle.buildOrganizationSummary(input.authContext.organization as Parameters<typeof lifecycle.buildOrganizationSummary>[0]));
    expect(services.listRecentMessagesByConversation.mock.calls).toEqual([["conversation", 12, "org"], ["conversation", 12, "org"]]);
    const runScope = { ...shared, runContext: textContext, input: { organizationSummary: textSummary, artifactFormatHint: null }, deliverableArtifact: null, clientAction: null, workspaceNavigation: null, workspaceClosed: false, onWorkspaceNavigate: undefined, onWorkspaceClose: undefined };
    const textInstructions = await evaluate(call(runtime, "buildExecutiveInstructions").getText(runtime), runScope);
    expect(textInstructions).toBe(shared.buildExecutiveInstructions(neutralContext, textSummary, null));
    const textTools = await evaluate(call(runtime, "buildExecutiveTools").getText(runtime), runScope);
    const neutralTools = shared.buildExecutiveTools(neutralContext, () => {}, () => {}, () => {}, () => {});
    const descriptors = (tools: { builder: string; args: unknown[] }[]) => tools.map(t => ({ builder: t.builder, args: t.args.map(a => typeof a === "function" ? "callback" : a) }));
    expect(textTools.length).toBeGreaterThan(0);
    expect(descriptors(textTools)).toEqual(descriptors(neutralTools));
    expect(await lifecycle.persistCanonicalUserTurn(userPayload)).toEqual(await lifecycle.persistCanonicalUserTurn({ organizationId: "org", actorUserId: "user", conversationId: "conversation", content: input.message }));
    expect(await lifecycle.persistCanonicalAssistantTurn(assistantPayload)).toEqual(await lifecycle.persistCanonicalAssistantTurn({ organizationId: "org", conversationId: "conversation", content: scope.aiContent, metadata: { ...metadata, executiveBrain: null, executiveAssessment: null, universalCapture: null, conversationTurnArtifacts: [], lastSuccessfulOperationContext: null, degradedSignals: [] } }));
  });

  it("shared boundaries have no direct HTTP, browser, audio or Realtime dependency", () => {
    const forbidden = /^(Request|Response|ReadableStream|NDJSON|controller|window|document|navigator|Audio|AudioContext|MediaSource|RTCPeerConnection|RealtimeSession|WebAudio|STT|TTS)$/;
    for (const path of ["../assembly.ts", "../turn-lifecycle.ts"]) {
      const file = parse(read(path));
      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node)) expect(node.text, path).not.toMatch(forbidden);
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier) expect(node.moduleSpecifier.getText(file), path).not.toMatch(/next\/(headers|server)|\/app\/|\/components\/|\/voice\/|realtime|webrtc|tts|stt/i);
        }
        if (ts.isCallExpression(node) && (node.expression.getText(file) === "require" || node.expression.kind === ts.SyntaxKind.ImportKeyword)) throw new Error("Unexpected dynamic dependency in shared boundary");
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  });
});
