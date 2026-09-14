import { tool } from "@openai/agents";

import {
  TASK_UPDATE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createTaskUpdateTool() {
  return tool<
    typeof TASK_UPDATE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...TASK_UPDATE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: TASK_UPDATE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
