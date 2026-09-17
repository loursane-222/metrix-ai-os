import { tool } from "@openai/agents";
import {
  APPROVAL_LIST_BUSINESS_TOOL,
  APPROVAL_REQUEST_BUSINESS_TOOL,
  APPROVAL_RESOLVE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";
import type { ExecutiveToolContext } from "../types";

function execute(name: "approval_request" | "approval_resolve" | "approval_list", args: unknown, context: ExecutiveToolContext | undefined) {
  return executeMetrixBusinessTool({ name, argumentsJson: JSON.stringify(args), context: metrixTrustedToolContextForExecutiveTurn(context) });
}

export function createApprovalTools() {
  return [
    tool<typeof APPROVAL_REQUEST_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...APPROVAL_REQUEST_BUSINESS_TOOL, execute: (args, ctx) => execute("approval_request", args, ctx?.context) }),
    tool<typeof APPROVAL_RESOLVE_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...APPROVAL_RESOLVE_BUSINESS_TOOL, execute: (args, ctx) => execute("approval_resolve", args, ctx?.context) }),
    tool<typeof APPROVAL_LIST_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...APPROVAL_LIST_BUSINESS_TOOL, execute: (args, ctx) => execute("approval_list", args, ctx?.context) })
  ];
}
