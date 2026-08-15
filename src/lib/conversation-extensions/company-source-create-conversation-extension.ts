import { resolveAndDispatchCompanySourceCreateSurfaceCommand } from "@/lib/company/company-source-create-command-integration";
import { getActiveCompanySourceCreateSurfaceDescriptor } from "@/lib/company/company-source-create-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";
export const companySourceCreateConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const d = getActiveCompanySourceCreateSurfaceDescriptor(); return d ? `company-source-create:${d.token}` : null; },
  async execute(utterance) {
    let result;
    try { result = await resolveAndDispatchCompanySourceCreateSurfaceCommand(utterance); }
    catch { return { status: "HANDOFF", handoff: companyHandoff({ operation: "CREATE", outcomeCode: "COMPANY_SOURCE_CREATE_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: "COMPANY_SOURCE_CREATE_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: companyHandoff({ operation: result.command.type === "commit" ? "CREATE" : "UPDATE", outcomeCode: result.command.type === "commit" ? "COMPANY_SOURCE_COMMITTED" : "COMPANY_SOURCE_CREATE_FORM_EXECUTED", resultStatus: "EXECUTED", mutationPerformed: result.command.type === "commit", ...(result.command.type === "set_field" ? { fieldNames: [result.command.field] } : {}) }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "CREATE", outcomeCode: "COMPANY_SOURCE_CREATE_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: companyHandoff({ operation: "CREATE", outcomeCode: "COMPANY_SOURCE_CREATE_FAILED", resultStatus: "FAILED", failureCode: `COMPANY_SOURCE_CREATE_${result.status}` }) };
  },
};
