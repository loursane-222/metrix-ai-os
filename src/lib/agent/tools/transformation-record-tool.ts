import { tool } from "@openai/agents";

import {
  TRANSFORMATION_RECORD_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createTransformationRecordTool() {
  return tool<
    typeof TRANSFORMATION_RECORD_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...TRANSFORMATION_RECORD_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: TRANSFORMATION_RECORD_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
