import { ok, fail } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { buildExecutiveOperatingContext } from "@/lib/executive-operating-context";
import { buildExecutiveDecisionResult } from "@/lib/executive-decision-engine";
import { buildExecutiveDelegationResult } from "@/lib/executive-delegation";
import { buildExecutiveResponsibilityMatrix } from "@/lib/executive-responsibility-matrix";
import { buildExecutivePerformanceSignalResult } from "@/lib/executive-performance-signal";
import { buildExecutiveManagementReviewResult } from "@/lib/executive-management-review";
import { buildExecutiveReport } from "@/lib/executive-reporting";

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const organizationId = authContext.organization.id;

    const operatingContext = await buildExecutiveOperatingContext({
      organizationId,
      mode: "DASHBOARD",
      writePolicy: {
        syncCollectionActions: false,
        writeSignalSnapshot: false,
        writeDecisionRecords: false,
      },
    });

    const outcomeAggregate = operatingContext.executiveDecisionContext?.outcomeAggregate ?? null;

    const executiveDecisionResult = buildExecutiveDecisionResult({ operatingContext });
    const executiveDelegationResult = buildExecutiveDelegationResult({
      operatingContext,
      executiveDecisionResult,
      currentUserName: null,
      organizationMembershipRole: null,
    });
    const executiveResponsibilityMatrixResult = buildExecutiveResponsibilityMatrix({
      operatingContext,
      executiveDecisionResult,
      executiveDelegationResult,
    });
    const executivePerformanceSignalResult = buildExecutivePerformanceSignalResult({
      operatingContext,
      executiveDecisionResult,
      executiveDelegationResult,
      executiveResponsibilityMatrixResult,
      outcomeAggregate,
    });

    const executiveManagementReview = buildExecutiveManagementReviewResult({
      operatingContext,
      executiveDecisionResult,
      executivePerformanceSignalResult,
      executiveResponsibilityMatrixResult,
      companyPerformanceSignal: operatingContext.companyPerformanceSignal ?? null,
      outcomeAggregate,
    });

    const generatedAt = new Date().toISOString();

    const report = buildExecutiveReport({
      reportType: "MONTHLY_EXECUTIVE",
      organizationId,
      executiveScorecard: operatingContext.executiveScorecard,
      executiveForecast: operatingContext.executiveForecast,
      executiveAlerts: operatingContext.executiveAlerts,
      companyPerformanceSignal: operatingContext.companyPerformanceSignal ?? null,
      financialHealthIntelligence: operatingContext.financialHealthIntelligence ?? null,
      paymentIntelligence: operatingContext.paymentIntelligence ?? null,
      paymentContext: operatingContext.paymentContext ?? null,
      outcomeAggregate,
      executiveManagementReview,
      failedSteps: operatingContext.diagnostics.failedSteps,
    });

    return ok({ report, generatedAt });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return authFail(error);
    }

    return fail("Board report generation failed.");
  }
}
