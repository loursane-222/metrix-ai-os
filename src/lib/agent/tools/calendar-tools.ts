import { tool } from "@openai/agents";
import {
  CALENDAR_CREATE_BUSINESS_TOOL,
  CALENDAR_LIST_BUSINESS_TOOL,
  CALENDAR_UPDATE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";
import type { ExecutiveToolContext } from "../types";

function execute(name: "calendar_list" | "calendar_create" | "calendar_update", args: unknown, context: ExecutiveToolContext | undefined) {
  return executeMetrixBusinessTool({ name, argumentsJson: JSON.stringify(args), context: metrixTrustedToolContextForExecutiveTurn(context) });
}

export function createCalendarTools() {
  return [
    tool<typeof CALENDAR_LIST_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...CALENDAR_LIST_BUSINESS_TOOL, execute: (args, ctx) => execute("calendar_list", args, ctx?.context) }),
    tool<typeof CALENDAR_CREATE_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...CALENDAR_CREATE_BUSINESS_TOOL, execute: (args, ctx) => execute("calendar_create", args, ctx?.context) }),
    tool<typeof CALENDAR_UPDATE_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...CALENDAR_UPDATE_BUSINESS_TOOL, execute: (args, ctx) => execute("calendar_update", args, ctx?.context) })
  ];
}
