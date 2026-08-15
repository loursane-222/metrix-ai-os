import { resolveAndDispatchCompanyProfileEditSurfaceCommand } from "@/lib/company/company-profile-edit-command-integration";
import { getActiveCompanyProfileEditSurfaceDescriptor } from "@/lib/company/company-profile-edit-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";
export const companyProfileEditConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const d = getActiveCompanyProfileEditSurfaceDescriptor(); return d ? `company-profile-edit:${d.token}` : null; },
  async execute(utterance) {
    let result;
    try { result = await resolveAndDispatchCompanyProfileEditSurfaceCommand(utterance); }
    catch { return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_PROFILE_EDIT_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: "COMPANY_PROFILE_EDIT_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: result.command.type === "commit" ? "COMPANY_PROFILE_COMMITTED" : "COMPANY_PROFILE_EDIT_EXECUTED", resultStatus: "EXECUTED", mutationPerformed: true, ...((result.command.type === "set_field" || result.command.type === "clear_field" || result.command.type === "revert_field") ? { fieldNames: [result.command.field] } : {}) }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_PROFILE_EDIT_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_PROFILE_EDIT_FAILED", resultStatus: "FAILED", failureCode: `COMPANY_PROFILE_EDIT_${result.status}` }) };
  },
};
