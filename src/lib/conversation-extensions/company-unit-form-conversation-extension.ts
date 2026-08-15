import { resolveAndDispatchCompanyUnitFormSurfaceCommand } from "@/lib/company/company-unit-form-command-integration";
import { getActiveCompanyUnitFormSurfaceDescriptor } from "@/lib/company/company-unit-form-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";
export const companyUnitFormConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const d = getActiveCompanyUnitFormSurfaceDescriptor(); return d ? `company-unit-form:${d.token}` : null; },
  async execute(utterance) {
    let result;
    try { result = await resolveAndDispatchCompanyUnitFormSurfaceCommand(utterance); }
    catch { return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_UNIT_FORM_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: "COMPANY_UNIT_FORM_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: companyHandoff({ operation: result.command.type === "commit" ? "CREATE" : "UPDATE", outcomeCode: result.command.type === "commit" ? "COMPANY_UNIT_COMMITTED" : "COMPANY_UNIT_FORM_EXECUTED", resultStatus: "EXECUTED", mutationPerformed: result.command.type === "commit", ...(result.command.type === "set_field" ? { fieldNames: [result.command.field] } : {}) }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_UNIT_FORM_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_UNIT_FORM_FAILED", resultStatus: "FAILED", failureCode: `COMPANY_UNIT_FORM_${result.status}` }) };
  },
};
