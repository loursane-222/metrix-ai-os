import { resolveAndDispatchCompanyProfileCandidateSurfaceCommand } from "@/lib/company/company-profile-candidate-command-integration";
import { getActiveCompanyProfileCandidateSurfaceDescriptor } from "@/lib/company/company-profile-candidate-surface-command-channel";
import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";
export const companyProfileCandidateConversationExtension: ConversationExtension = {
  getActiveScopeKey() { const d = getActiveCompanyProfileCandidateSurfaceDescriptor(); return d ? `company-profile-candidate:${d.token}` : null; },
  async execute(utterance) {
    let result;
    try { result = await resolveAndDispatchCompanyProfileCandidateSurfaceCommand(utterance); }
    catch { return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_CANDIDATE_EXECUTION_FAILED", resultStatus: "FAILED", failureCode: "COMPANY_CANDIDATE_EXECUTION_FAILED" }) }; }
    if (!result || result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return { status: "NOT_HANDLED", handoff: null };
    if (result.status === "EXECUTED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: result.command.type === "commit" ? "COMPANY_CANDIDATE_SUBMITTED" : "COMPANY_CANDIDATE_EDIT_EXECUTED", resultStatus: result.command.type === "commit" ? "APPROVAL_REQUIRED" : "EXECUTED", mutationPerformed: true, approvalRequired: result.command.type === "commit", ...((result.command.type === "set_field" || result.command.type === "clear_field" || result.command.type === "revert_field") ? { fieldNames: [result.command.field] } : {}) }) };
    if (result.status === "CLARIFICATION_REQUIRED") return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_CANDIDATE_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED" }) };
    return { status: "HANDOFF", handoff: companyHandoff({ operation: "UPDATE", outcomeCode: "COMPANY_CANDIDATE_FAILED", resultStatus: "FAILED", failureCode: `COMPANY_CANDIDATE_${result.status}` }) };
  },
};
