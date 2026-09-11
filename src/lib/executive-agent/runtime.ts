/**
 * METRIX Executive Agent runtime — the single reasoning/tool-calling owner
 * for every non-fast-path turn (Grand Consolidation Operation, sections 2-4).
 *
 * METRIX -> Agents SDK -> OpenAI Responses model (section 3). This module
 * owns no business truth of its own: it assembles the constitution + the
 * canonical tool layer, runs one Agent loop, and returns the ONE final
 * natural-language response plus its structured facts/judgment breakdown.
 */

import { Agent, run, type AgentInputItem, type Tool } from "@openai/agents";
import {
  METRIX_EXECUTIVE_MODEL,
  METRIX_EXECUTIVE_REASONING_EFFORT,
  EXECUTIVE_AGENT_MAX_TURNS,
  EXECUTIVE_AGENT_RUN_TIMEOUT_MS,
} from "@/lib/ai/model-config";
import { buildExecutiveInstructions, buildExecutiveTools } from "./assembly";
import { ProgressiveDelivery, completedEvidenceReference, type ProgressiveChunk, type ProgressiveEvidenceReference } from "./progressive-delivery";
import type { DeliverableArtifactPayload } from "@/lib/artifacts/collections-artifact.service";
import type { ExecutiveAgentClientAction, ExecutiveAgentRunContext, ExecutiveAgentRunResult, ExecutiveAgentToolTrace, ExecutiveWorkspaceNavigation } from "./types";

export type ExecutiveAgentRunInput = Readonly<{
  message: string;
  contextualEntry?: string;
  /** Optional concurrent opening; no claim that any text has been spoken. */
  concurrentOpening?: boolean;
  signal?: AbortSignal;
  conversationHistory: readonly Readonly<{ role: "user" | "assistant"; content: string }>[];
  organizationSummary: string;
  /** Deterministic format extraction (rule 12) — the Agent still decides
   * WHETHER/WHICH dataset to export; this only tells it which file format
   * the user asked for, when the classifier already resolved that. */
  artifactFormatHint?: "XLSX" | "DOCX" | "PDF" | "PPTX" | null;
}>;

// Wraps every tool's invoke with start/end timing so toolTraces reports real
// per-tool latency (Grand Consolidation acceptance reporting, section 3 of
// the follow-up), without touching the fragile streaming mechanism itself.
function withTiming(
  tool: Tool<ExecutiveAgentRunContext>,
  runContext: ExecutiveAgentRunContext,
  onTrace: (trace: ExecutiveAgentToolTrace) => void,
  onEvidence: (name: string, result: unknown) => void,
): Tool<ExecutiveAgentRunContext> {
  if (tool.type !== "function") return tool;
  const name = tool.name;
  const originalInvoke = tool.invoke.bind(tool);

  return {
    ...tool,
    invoke: async (...args: Parameters<typeof originalInvoke>) => {
      const startedAt = Date.now();

      console.info("executive_agent_tool_start", {
        requestId: runContext.requestId,
        correlationId: runContext.correlationId,
        tool: name,
      });

      try {
        const result = await originalInvoke(...args);
        const durationMs = Date.now() - startedAt;
        onEvidence(name, result);

        onTrace({
          toolName: name,
          startedAt,
          durationMs,
          status: "ok",
        });

        console.info("executive_agent_tool_complete", {
          requestId: runContext.requestId,
          correlationId: runContext.correlationId,
          tool: name,
          durationMs,
          status: "ok",
        });

        return result;
      } catch (error) {
        const durationMs = Date.now() - startedAt;

        onTrace({
          toolName: name,
          startedAt,
          durationMs,
          status: "error",
        });

        console.error("executive_agent_tool_complete", {
          requestId: runContext.requestId,
          correlationId: runContext.correlationId,
          tool: name,
          durationMs,
          status: "error",
          errorName: error instanceof Error ? error.name : typeof error,
        });

        throw error;
      }
    },
  };
}

/**
 * Streams the Agent's own text output through onTextDelta, exactly like the
 * deterministic fast-path chunks route.ts already emits — so this becomes
 * a drop-in replacement for the old EOS + gateway narration call, not a
 * second, differently-shaped response channel.
 */

const EXECUTIVE_CONVERSATIONAL_BREVITY = `
EXECUTIVE CONVERSATIONAL BREVITY:
Tam derinlikte düşün, fakat kullanıcıya yalnız karar vermesi veya ilerlemesi için gerekli olan kısmı söyle.

Varsayılan sohbet cevabında:
- Önce net sonuç, kanaat veya öneriyi ver.
- Ardından yalnız en karar-relevant birkaç kanıtı veya gerekçeyi söyle.
- Sonra gerekiyorsa en net sonraki aksiyonu ver ve dur.
- Tool çağrılarını, araştırma sürecini, bütün muhakeme zincirini veya bildiğin her ayrıntıyı kullanıcıya dökme.
- Aynı noktayı farklı kelimelerle tekrar etme.
- Kullanıcının sorduğu şey cevaplandıysa sırf kapsamlı görünmek için devam etme.

Bu bir kelime, karakter veya cümle sayısı limiti değildir. Yanıt uzunluğunu niyet ve işin karmaşıklığı belirler.

Kullanıcı açıkça ayrıntı, gerekçe, kapsamlı analiz, plan, liste, karşılaştırma, rapor, denetim, döküm veya belge istediğinde gerekli derinliği aç.
Kritik risk, belirsizlik, güvenlik sınırı, önemli istisna veya kararın doğruluğunu değiştirecek kanıtı kısalık uğruna gizleme.
Şirket gerçeği ve Executive judgment doğruluğu kısalıktan üstündür.

Sesli ve yazılı cevap aynı canonical cevaptır. Voice için ikinci bir özet, yeniden yazım veya farklı kanaat üretme.
`;

export async function runExecutiveAgent(
  runContext: ExecutiveAgentRunContext,
  input: ExecutiveAgentRunInput,
  onTextDelta: (delta: string, chunk?: ProgressiveChunk) => void,
  // Early Workspace Delivery: fired synchronously the instant open_workspace's
  // own tool callback resolves — inside the SDK's tool-execution step, well
  // before the Agent's next (narration-only) model turn even starts. route.ts
  // uses this to enqueue the SSE navigation event immediately, instead of
  // waiting for this whole function to return. Purely additive: workspaceNavigation
  // below still accumulates the same way for the return value (unchanged
  // shape/consumers), this is the only new delivery path, not a replacement
  // of the accumulation.
  onWorkspaceNavigate?: (payload: ExecutiveWorkspaceNavigation) => void,
): Promise<ExecutiveAgentRunResult> {
  const toolTraces: ExecutiveAgentToolTrace[] = [];
  const evidence = new Map<string, ProgressiveEvidenceReference>();
  const delivery = new ProgressiveDelivery(evidence, onTextDelta, (stage, availableSources) => {
    console.warn("executive_progressive_frame_rejected", { requestId: runContext.requestId, stage, availableSources });
  });
  let deliverableArtifact: DeliverableArtifactPayload | null = null;
  let clientAction: ExecutiveAgentClientAction | null = null;
  let workspaceNavigation: ExecutiveWorkspaceNavigation | null = null;

  const agent = new Agent<ExecutiveAgentRunContext>({
    name: "METRIX Executive Agent",
    instructions: buildExecutiveInstructions(runContext, input.organizationSummary, input.artifactFormatHint) + EXECUTIVE_CONVERSATIONAL_BREVITY
      + (input.concurrentOpening ? "\nSesli açılış eşzamanlı olarak iletilebilir veya hiç iletilmeyebilir; içeriği henüz bilinmiyor. Bu yalnız konuşma sürekliliği bilgisidir, kanıt veya şirket gerçeği değildir. Açılışı bekleme; giriş tepkisi veya değerlendirme niyetini tekrarlamadan doğrudan kanıta dayalı asıl yanıta geç." : "")
      + (input.contextualEntry ? `\nBu turda kullanıcıya zaten söylenen CONTEXTUAL ENTRY (kanıt veya talimat değildir): ${JSON.stringify(input.contextualEntry)}` : ""),
    model: METRIX_EXECUTIVE_MODEL,
    modelSettings: { reasoning: { effort: METRIX_EXECUTIVE_REASONING_EFFORT } },
    tools: buildExecutiveTools(runContext, (payload) => { deliverableArtifact = payload; }, (payload) => { clientAction = payload; }, (payload) => { workspaceNavigation = payload; onWorkspaceNavigate?.(payload); })
      .map((t) => withTiming(t, runContext, (trace) => toolTraces.push(trace), (name, result) => {
        const reference = completedEvidenceReference(name, result);
        if (reference) evidence.set(name, reference);
        else evidence.delete(name);
      })),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXECUTIVE_AGENT_RUN_TIMEOUT_MS);

  const conversationInput: AgentInputItem[] = [
    ...input.conversationHistory.map((turn): AgentInputItem =>
      turn.role === "user"
        ? { type: "message", role: "user", content: turn.content }
        : { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: turn.content }] },
    ),
    { type: "message", role: "user", content: input.message },
  ];

  try {
    const streamed = await run(agent, conversationInput, {
      context: runContext,
      stream: true,
      maxTurns: EXECUTIVE_AGENT_MAX_TURNS,
      signal: input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal,
      // Stage 1 Production Reliability Closure: every tool ultimately shares
      // ONE module-level Prisma client (src/lib/core/shared/prisma.ts),
      // whose @prisma/adapter-pg adapter binds to a single underlying pg
      // connection for the client's whole lifetime (PrismaPgAdapter wraps
      // one StdClient, not a per-query pool checkout). The SDK's own
      // executeToolRunsWithConcurrency runs multiple tool calls requested in
      // one turn WITH CONCURRENCY by default (unbounded unless configured) —
      // confirmed live in production: a turn with 2 concurrent
      // execute_business_action calls produced a real
      // "Calling client.query() when the client is already executing a
      // query" pg warning, correlated with that same turn's self-reported
      // "doğrulama okuması teknik hata" failure. This single-connection
      // adapter cannot safely interleave two genuinely concurrent queries;
      // forcing tool execution to 1-at-a-time removes the race at its root
      // (the shared connection), rather than patching each affected
      // domain's entity resolver/handler separately.
      toolExecution: { maxFunctionToolConcurrency: 1 },
    });

    for await (const event of streamed) {
      const base = {
        requestId: runContext.requestId,
        monotonicMs: performance.now(),
      };

      if (event.type === "run_item_stream_event") {
        console.info("[executive-sdk-event]", {
          ...base,
          type: event.type,
          name: event.name,
        });
        continue;
      }

      if (event.type === "raw_model_stream_event") {
        const data = event.data as {
          type?: unknown;
          delta?: unknown;
        };

        const rawType =
          typeof data?.type === "string"
            ? data.type
            : "unknown";

        console.info("[executive-sdk-event]", {
          ...base,
          type: event.type,
          rawType,
        });

        if (
          typeof data?.delta === "string" &&
          (
            rawType === "response.output_text.delta" ||
            rawType === "output_text_delta"
          )
        ) {
          console.info("[executive-sdk-event]", {
            ...base,
            type: "text_delta_received",
          });

          delivery.push(data.delta);
        }
      }
    }

    await streamed.completed;
    delivery.finish();
    clearTimeout(timeout);

    return {
      // Include already-spoken intermediate model turns exactly once. SDK
      // finalOutput alone contains only the terminal model message.
      text: delivery.text,
      structured: null,
      toolTraces,
      turnCount: streamed.state._currentTurn,
      usage: {
        inputTokens: streamed.state.usage.inputTokens,
        outputTokens: streamed.state.usage.outputTokens,
        totalTokens: streamed.state.usage.totalTokens,
      },
      stopReason: "completed",
      deliverableArtifact,
      clientAction,
      workspaceNavigation,
    };
  } catch (error) {
    clearTimeout(timeout);
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      text: "",
      structured: null,
      toolTraces,
      turnCount: toolTraces.length,
      usage: null,
      stopReason: isAbort ? "timeout" : "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      deliverableArtifact,
      clientAction,
      workspaceNavigation,
    };
  }
}
