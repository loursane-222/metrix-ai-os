import {
  tool
} from "@openai/agents";

import {
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn,
  TASK_CREATE_BUSINESS_TOOL
} from "./metrix-business-tool-runtime";

import type {
  ExecutiveToolContext
} from "../types";

export type {
  ExecutiveToolContext
} from "../types";

export function createTaskCreateTool() {
  return tool<
    typeof TASK_CREATE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...TASK_CREATE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: TASK_CREATE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
