import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

describe("management turn determinism route contract", () => {
  it("completes canonical management intelligence through the traced provider-skip path", () => {
    expect(route).toContain("buildInvoicedActivityDataset(authContext.organization.id");
    expect(route).toContain("buildOperationsManagementDataset(authContext.organization.id");
    expect(route).toContain("buildCustomerManagementDataset(receivableDataset, quotePipelineDataset, orderOperationsDataset, invoicedActivityDataset)");
    expect(route).toContain("buildCompanyManagementResponse({ financial: financialOverviewDataset");
    expect(route).toContain("buildCompanyManagementAttentionResponse({ financial: financialOverviewDataset");
    expect(route).toContain("const hasCompletedDeterministicManagementCompletionTurn");
    expect(route).toContain("hasCompletedDeterministicQuotePipelineTurn || hasCompletedDeterministicManagementCompletionTurn");
  });
  it("completes canonical current quote pipeline without provider or enrichment", () => {
    expect(route).toContain("buildCurrentQuotePipelineDataset(authContext.organization.id");
    expect(route).toContain("const hasCompletedDeterministicQuotePipelineTurn");
    expect(route).toContain("hasCompletedDeterministicQuoteActivityTurn || hasCompletedDeterministicQuotePipelineTurn");
    expect(route).toContain("quotePipelineDataset ? buildCurrentQuotePipelinePromptLine(quotePipelineDataset) : null");
  });
  it("completes canonical quote activity answer-only without provider or enrichment", () => {
    expect(route).toContain("buildQuoteActivityDataset(authContext.organization.id");
    expect(route).toContain("const hasCompletedDeterministicQuoteActivityTurn");
    expect(route).toContain("const hasCompletedDeterministicManagementTurn = hasCompletedDeterministicFinancialTurn || hasCompletedDeterministicQuoteActivityTurn");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicManagementTurn");
    expect(route).toContain("quoteActivityDataset ? buildQuoteActivityPromptLine(quoteActivityDataset) : null");
  });
  it("resolves management intent before provider classification and never projects Payment navigation for it", () => {
    expect(route.indexOf("recognizeManagementIntent(message)")).toBeLessThan(route.indexOf("classifyConversation({ message, recentMessages })"));
    expect(route).toContain("buildManagementIntentUnderstanding(deterministicManagementIntent)");
    expect(route).toContain("const currentFactEntities = deterministicManagementIntent ? []");
    expect(route).toContain("const canonicalBusinessFacts = deterministicManagementIntent\n      ? []");
    expect(route).toContain("deterministicQuoteCohortMessage ?? deterministicOrderBacklogMessage ?? deterministicConfirmedOrderFlowMessage ?? deterministicPostedSalesMessage");
  });

  it("completes a resolved collection-performance turn without answer-model work", () => {
    expect(route).toContain("const hasCompletedDeterministicCollectionPerformance = Boolean(");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicManagementTurn");
    expect(route).toContain("onExecutiveConversationGuidanceObserved: (guidance) => {");
    expect(route).toContain("executiveRuntimeTrace.observeCanonicalPrompt(");
    expect(route).toContain("providerGenerationSkipped: hasCompletedDeterministicManagementTurn");
    expect(route).toContain("? (deterministicQuoteCohortMessage ?? deterministicOrderBacklogMessage ?? deterministicConfirmedOrderFlowMessage ?? deterministicPostedSalesMessage");
  });

  it("completes drivers and target position through the traced no-provider path", () => {
    expect(route).toContain("projectCollectionDriversTurnFact(");
    expect(route).toContain("projectCollectionTargetTurnFact(");
    expect(route).toContain("hasCompletedDeterministicCollectionDrivers");
    expect(route).toContain("hasCompletedDeterministicCollectionTarget");
    expect(route).toContain("collectionDriversTurnFact ? buildCollectionDriversPromptLine(collectionDriversTurnFact) : null");
    expect(route).toContain("collectionTargetTurnFact ? buildCollectionTargetPromptLine(collectionTargetTurnFact) : null");
  });

  it("completes collection comparison through the same traced no-provider path", () => {
    expect(route).toContain("projectCollectionComparisonTurnFact(");
    expect(route).toContain("const hasCompletedDeterministicCollectionComparison = Boolean(");
    expect(route).toContain("const hasCompletedDeterministicCollectionTurn =");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicManagementTurn");
    expect(route).toContain("collectionComparisonTurnFact ? buildCollectionComparisonPromptLine(collectionComparisonTurnFact) : null");
    expect(route).toContain("executiveRuntimeTrace.observeCanonicalPrompt(");
    expect(route).toContain("onExecutiveConversationGuidanceObserved: (guidance) => {");
  });

  it("completes current receivable turns through the traced no-provider path", () => {
    expect(route).toContain("buildCurrentReceivableDataset(authContext.organization.id");
    expect(route).toContain("const hasCompletedDeterministicReceivableTurn");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicManagementTurn");
    expect(route).toContain("deterministicCurrentReceivableMessage");
  });
  it("completes cash and payable turns through the traced no-provider path", () => {
    expect(route).toContain("buildCashPositionDataset(authContext.organization.id");
    expect(route).toContain("buildCashFlowDataset(authContext.organization.id");
    expect(route).toContain("buildCurrentPayableDataset(authContext.organization.id");
    expect(route).toContain("hasCompletedDeterministicCashPayablesTurn");
  });
  it("completes financial attention through canonical evidence and the traced no-provider path", () => {
    expect(route).toContain('conversationUnderstanding.managementIntent?.intent === "FINANCIAL_ATTENTION"');
    expect(route).toContain("evaluateFinancialAttention({ receivables: attentionReceivables, payables: attentionPayables, cashPosition: attentionCashPosition, currentCollections })");
    expect(route).toContain("hasCompletedDeterministicFinancialAttentionTurn");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicManagementTurn");
  });
  it("completes financial overview from accepted datasets through the traced no-provider path", () => {
    expect(route).toContain('conversationUnderstanding.managementIntent?.intent === "FINANCIAL_OVERVIEW"');
    expect(route).toContain("financialOverviewDataset = buildFinancialManagementSynthesis(");
    expect(route).toContain("buildFinancialManagementSynthesisResponse(financialOverviewDataset)");
    expect(route).toContain("hasCompletedDeterministicFinancialOverviewTurn");
    expect(route).toContain("skipProviderGeneration: hasCompletedDeterministicManagementTurn");
  });
});
