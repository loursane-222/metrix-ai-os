import { tool } from "@openai/agents";

import {
  TASK_LIST_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createTaskListTool() {
  return tool<
    typeof TASK_LIST_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...TASK_LIST_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: TASK_LIST_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
