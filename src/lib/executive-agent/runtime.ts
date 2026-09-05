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
import { EXECUTIVE_CONSTITUTION } from "./constitution";
import type { DeliverableArtifactPayload } from "@/lib/artifacts/collections-artifact.service";
import type { ExecutiveAgentRunContext, ExecutiveAgentRunResult, ExecutiveAgentToolTrace } from "./types";

import { buildCompanyReadTool, buildCompanyWriteTool, buildCompanyQueryTool } from "./tools/company-canonical-tools";
import {
  buildCashPositionTool, buildCashFlowTool, buildReceivablesOverviewTool, buildPayablesOverviewTool,
  buildCollectionsPerformanceTool, buildFinancialAttentionTool, buildFinancialOverviewTool,
} from "./tools/financial-tools";
import { buildCollectionsComparisonTool, buildCollectionsDriversTool, buildCollectionsTargetTool } from "./tools/collections-tools";
import {
  buildQuoteActivityTool, buildQuoteCohortTool, buildQuotePipelineTool, buildOrderBacklogTool,
  buildConfirmedOrderFlowTool, buildInvoicedActivityTool, buildOrderOperationsTool,
  buildOperationsOverviewTool, buildCustomerManagementOverviewTool,
} from "./tools/sales-operations-tools";
import { buildMemorySearchTool, buildOpenCommitmentsTool } from "./tools/memory-tools";
import { buildExternalEvidenceTool } from "./tools/external-evidence-tool";
import { buildListAvailableActionsTool, buildExecuteBusinessActionTool } from "./tools/action-tools";
import { buildCollectionsArtifactTool } from "./tools/artifact-tool";
import { buildCalendarTool, buildTasksTool } from "./tools/calendar-tasks-tools";
import {
  buildLogFieldVisitReportTool, buildFieldVisitWeeklySummaryTool, buildSubmitRepGoalReportTool,
  buildProposeRepRequestTool, buildSendPaymentReminderTool, buildSendSupplierMessageTool,
} from "./tools/residual-capability-tools";

export type ExecutiveAgentRunInput = Readonly<{
  message: string;
  conversationHistory: readonly Readonly<{ role: "user" | "assistant"; content: string }>[];
  organizationSummary: string;
  /** Deterministic format extraction (rule 12) — the Agent still decides
   * WHETHER/WHICH dataset to export; this only tells it which file format
   * the user asked for, when the classifier already resolved that. */
  artifactFormatHint?: "XLSX" | "DOCX" | "PDF" | "PPTX" | null;
}>;

function buildTools(runContext: ExecutiveAgentRunContext, onArtifactGenerated: (payload: DeliverableArtifactPayload) => void) {
  return [
    buildCompanyReadTool(runContext),
    buildCompanyWriteTool(runContext),
    buildCompanyQueryTool(runContext),
    buildCashPositionTool(runContext),
    buildCashFlowTool(runContext),
    buildReceivablesOverviewTool(runContext),
    buildPayablesOverviewTool(runContext),
    buildCollectionsPerformanceTool(runContext),
    buildCollectionsComparisonTool(runContext),
    buildCollectionsDriversTool(runContext),
    buildCollectionsTargetTool(runContext),
    buildFinancialAttentionTool(runContext),
    buildFinancialOverviewTool(runContext),
    buildQuoteActivityTool(runContext),
    buildQuoteCohortTool(runContext),
    buildQuotePipelineTool(runContext),
    buildOrderBacklogTool(runContext),
    buildConfirmedOrderFlowTool(runContext),
    buildInvoicedActivityTool(runContext),
    buildOrderOperationsTool(runContext),
    buildOperationsOverviewTool(runContext),
    buildCustomerManagementOverviewTool(runContext),
    buildCalendarTool(runContext),
    buildTasksTool(runContext),
    buildMemorySearchTool(runContext),
    buildOpenCommitmentsTool(runContext),
    buildExternalEvidenceTool(),
    buildListAvailableActionsTool(),
    buildExecuteBusinessActionTool(runContext),
    buildCollectionsArtifactTool(runContext, onArtifactGenerated),
    buildLogFieldVisitReportTool(runContext),
    buildFieldVisitWeeklySummaryTool(runContext),
    buildSubmitRepGoalReportTool(runContext),
    buildProposeRepRequestTool(runContext),
    buildSendPaymentReminderTool(runContext),
    buildSendSupplierMessageTool(runContext),
  ];
}

// Wraps every tool's invoke with start/end timing so toolTraces reports real
// per-tool latency (Grand Consolidation acceptance reporting, section 3 of
// the follow-up), without touching the fragile streaming mechanism itself.
function withTiming(
  tool: Tool<ExecutiveAgentRunContext>,
  onTrace: (trace: ExecutiveAgentToolTrace) => void,
): Tool<ExecutiveAgentRunContext> {
  if (tool.type !== "function") return tool;
  const name = tool.name;
  const originalInvoke = tool.invoke.bind(tool);
  return {
    ...tool,
    invoke: async (...args: Parameters<typeof originalInvoke>) => {
      const startedAt = Date.now();
      try {
        const result = await originalInvoke(...args);
        onTrace({ toolName: name, startedAt, durationMs: Date.now() - startedAt, status: "ok" });
        return result;
      } catch (error) {
        onTrace({ toolName: name, startedAt, durationMs: Date.now() - startedAt, status: "error" });
        throw error;
      }
    },
  };
}

function buildInstructions(runContext: ExecutiveAgentRunContext, organizationSummary: string, artifactFormatHint?: string | null): string {
  return [
    EXECUTIVE_CONSTITUTION,
    "",
    "GÜNCEL BAĞLAM",
    `Şirket: ${runContext.organizationName}`,
    `Şu anki rol: ${runContext.role}`,
    `Zaman dilimi: ${runContext.timeZone}`,
    `Kanal: ${runContext.channel === "voice" ? "sesli" : "yazılı"}`,
    artifactFormatHint ? `Kullanıcı bu turda ${artifactFormatHint} formatında bir dosya istedi — ilgili canonical dataset tool'unu çağırıp uygun generate_*_artifact tool'unu bu formatla kullan.` : "",
    organizationSummary,
  ].filter(Boolean).join("\n");
}

/**
 * Streams the Agent's own text output through onTextDelta, exactly like the
 * deterministic fast-path chunks route.ts already emits — so this becomes
 * a drop-in replacement for the old EOS + gateway narration call, not a
 * second, differently-shaped response channel.
 */
export async function runExecutiveAgent(
  runContext: ExecutiveAgentRunContext,
  input: ExecutiveAgentRunInput,
  onTextDelta: (delta: string) => void,
): Promise<ExecutiveAgentRunResult> {
  const toolTraces: ExecutiveAgentToolTrace[] = [];
  let deliverableArtifact: DeliverableArtifactPayload | null = null;

  const agent = new Agent<ExecutiveAgentRunContext>({
    name: "METRIX Executive Agent",
    instructions: buildInstructions(runContext, input.organizationSummary, input.artifactFormatHint),
    model: METRIX_EXECUTIVE_MODEL,
    modelSettings: { reasoning: { effort: METRIX_EXECUTIVE_REASONING_EFFORT } },
    tools: buildTools(runContext, (payload) => { deliverableArtifact = payload; })
      .map((t) => withTiming(t, (trace) => toolTraces.push(trace))),
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
      signal: controller.signal,
    });

    for await (const chunk of streamed.toTextStream()) {
      onTextDelta(chunk);
    }
    await streamed.completed;
    clearTimeout(timeout);

    return {
      text: streamed.finalOutput ?? "",
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
    };
  }
}
