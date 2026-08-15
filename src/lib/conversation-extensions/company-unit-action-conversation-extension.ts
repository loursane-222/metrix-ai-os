import { resolveAndDispatchCompanyUnitActionSurfaceCommand } from "@/lib/company/company-unit-action-command-integration";
import { getCompanyUnitActionSurfaceDescriptors } from "@/lib/company/company-unit-action-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";
export const companyUnitActionConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    const ids = getCompanyUnitActionSurfaceDescriptors().map((d) => d.entityId).sort();
    return ids.length ? `company-unit-action:${ids.join(",")}` : null;
  },
  async execute(utterance) {
    let result;
    try { result = await resolveAndDispatchCompanyUnitActionSurfaceCommand(utterance); }
    catch { return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_UNIT_ACTION_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: "COMPANY_UNIT_ACTION_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: `COMPANY_UNIT_${result.command.type.toUpperCase()}_EXECUTED`, resultStatus: "EXECUTED", mutationPerformed: true }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_UNIT_ACTION_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_UNIT_ACTION_FAILED", resultStatus: "FAILED", failureCode: `COMPANY_UNIT_ACTION_${result.status}` }) };
  },
};
