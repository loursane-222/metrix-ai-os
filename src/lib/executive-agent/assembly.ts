/** Server-side Executive assembly; no model loop or transport ownership. */
import { EXECUTIVE_CONSTITUTION } from "./constitution";
import { PROGRESSIVE_DELIVERY_INSTRUCTIONS } from "./progressive-delivery";
import type { DeliverableArtifactPayload } from "@/lib/artifacts/collections-artifact.service";
import type { ExecutiveAgentClientAction, ExecutiveAgentRunContext } from "./types";

import { buildCompanyReadTool, buildCompanyWriteTool, buildCompanyQueryTool } from "./tools/company-canonical-tools";
import {
  buildCashPositionTool, buildCashFlowTool, buildReceivablesOverviewTool, buildPayablesOverviewTool,
  buildCollectionsPerformanceTool, buildFinancialAttentionTool, buildFinancialOverviewTool,
} from "./tools/financial-tools";
import { buildCollectionsComparisonTool, buildCollectionsDriversTool, buildCollectionsTargetTool } from "./tools/collections-tools";
import {
  buildQuoteActivityTool, buildQuoteCohortTool, buildQuotePipelineTool, buildOrderBacklogTool,
  buildConfirmedOrderFlowTool, buildInvoicedActivityTool, buildOrderOperationsTool,
  buildOperationsOverviewTool, buildCustomerManagementOverviewTool,
} from "./tools/sales-operations-tools";
import { buildMemorySearchTool, buildOpenCommitmentsTool } from "./tools/memory-tools";
import { buildExternalEvidenceTool } from "./tools/external-evidence-tool";
import { buildListAvailableActionsTool, buildExecuteBusinessActionTool } from "./tools/action-tools";
import { buildCollectionsArtifactTool } from "./tools/artifact-tool";
import { buildCalendarTool, buildTasksTool } from "./tools/calendar-tasks-tools";
import {
  buildLogFieldVisitReportTool, buildFieldVisitWeeklySummaryTool, buildSubmitRepGoalReportTool,
  buildProposeRepRequestTool, buildSendPaymentReminderTool, buildSendSupplierMessageTool,
  buildAnalyzeActiveDocumentAttachmentTool, buildComposePaymentReminderWhatsAppTool,
  buildFindCustomerOpenQuoteTool, buildResolveRelativeDueDateTool,
  buildCarrierPerformanceTool, buildDeliveryPerformanceTool, buildShipmentIntegrityTool,
  buildFindCustomerWonQuoteTool, buildDeliveryCommitmentRateTool, buildOrderDetailsTool, buildCriticalOrdersTool,
  buildStockHealthTool, buildStockExecutiveSignalsTool, buildListPendingStockVariancesTool, buildFindStockByProductAndWarehouseTool,
  buildFindCustomerMostRecentQuoteTool, buildComposeOfferWhatsAppTool,
  buildNotifyCustomerCreationTargetTool, buildGetActiveWorkspaceContextTool, buildResolveCustomerFieldValueTool,
} from "./tools/residual-capability-tools";
import {
  buildResolveCalendarExpressionTool, buildFindOrganizationMemberForCalendarTool, buildQueryMemberAvailabilityTool,
} from "./tools/calendar-semantic-tools";

export function buildExecutiveInstructions(runContext: ExecutiveAgentRunContext, organizationSummary: string, artifactFormatHint?: string | null): string {
  return [
    EXECUTIVE_CONSTITUTION,
    PROGRESSIVE_DELIVERY_INSTRUCTIONS,
    "",
    "GÜNCEL BAĞLAM",
    `Şirket: ${runContext.organizationName}`,
    `Şu anki rol: ${runContext.role}`,
    `Zaman dilimi: ${runContext.timeZone}`,
    `Kanal: ${runContext.channel === "voice" ? "sesli" : "yazılı"}`,
    artifactFormatHint ? `Kullanıcı bu turda ${artifactFormatHint} formatında bir dosya istedi — ilgili canonical dataset tool'unu çağırıp uygun generate_*_artifact tool'unu bu formatla kullan.` : "",
    organizationSummary,
  ].filter(Boolean).join("\n");
}

export function buildExecutiveTools(
  runContext: ExecutiveAgentRunContext,
  onArtifactGenerated: (payload: DeliverableArtifactPayload) => void,
  onClientAction: (payload: ExecutiveAgentClientAction) => void,
) {
  return [
    buildCompanyReadTool(runContext),
    buildCompanyWriteTool(runContext),
    buildCompanyQueryTool(runContext),
    buildCashPositionTool(runContext),
    buildCashFlowTool(runContext),
    buildReceivablesOverviewTool(runContext),
    buildPayablesOverviewTool(runContext),
    buildCollectionsPerformanceTool(runContext),
    buildCollectionsComparisonTool(runContext),
    buildCollectionsDriversTool(runContext),
    buildCollectionsTargetTool(runContext),
    buildFinancialAttentionTool(runContext),
    buildFinancialOverviewTool(runContext),
    buildQuoteActivityTool(runContext),
    buildQuoteCohortTool(runContext),
    buildQuotePipelineTool(runContext),
    buildOrderBacklogTool(runContext),
    buildConfirmedOrderFlowTool(runContext),
    buildInvoicedActivityTool(runContext),
    buildOrderOperationsTool(runContext),
    buildOperationsOverviewTool(runContext),
    buildCustomerManagementOverviewTool(runContext),
    buildCalendarTool(runContext),
    buildTasksTool(runContext),
    buildMemorySearchTool(runContext),
    buildOpenCommitmentsTool(runContext),
    buildExternalEvidenceTool(),
    buildListAvailableActionsTool(),
    buildExecuteBusinessActionTool(runContext),
    buildCollectionsArtifactTool(runContext, onArtifactGenerated),
    buildLogFieldVisitReportTool(runContext),
    buildFieldVisitWeeklySummaryTool(runContext),
    buildSubmitRepGoalReportTool(runContext),
    buildProposeRepRequestTool(runContext),
    buildSendPaymentReminderTool(runContext),
    buildSendSupplierMessageTool(runContext),
    buildAnalyzeActiveDocumentAttachmentTool(runContext),
    buildResolveCalendarExpressionTool(),
    buildFindOrganizationMemberForCalendarTool(runContext),
    buildQueryMemberAvailabilityTool(runContext),
    buildComposePaymentReminderWhatsAppTool(runContext, onClientAction),
    buildFindCustomerOpenQuoteTool(runContext),
    buildResolveRelativeDueDateTool(),
    buildCarrierPerformanceTool(runContext),
    buildDeliveryPerformanceTool(runContext),
    buildShipmentIntegrityTool(runContext),
    buildFindCustomerWonQuoteTool(runContext),
    buildDeliveryCommitmentRateTool(runContext),
    buildOrderDetailsTool(runContext),
    buildCriticalOrdersTool(runContext),
    buildStockHealthTool(runContext),
    buildStockExecutiveSignalsTool(runContext),
    buildListPendingStockVariancesTool(runContext),
    buildFindStockByProductAndWarehouseTool(runContext),
    buildFindCustomerMostRecentQuoteTool(runContext),
    buildComposeOfferWhatsAppTool(runContext, onClientAction),
    buildNotifyCustomerCreationTargetTool(runContext),
    buildGetActiveWorkspaceContextTool(runContext),
    buildResolveCustomerFieldValueTool(runContext),
  ];
}
