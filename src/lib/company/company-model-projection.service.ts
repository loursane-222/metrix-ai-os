import { evaluateKnowledgeSignal, type KnowledgeProjection } from "@/lib/executive-knowledge-authority";

export type CompanyModelV2 = {
  identity: Record<string, unknown>;
  businessModel: Record<string, unknown>;
  organizationStructure: Record<string, unknown>;
  financialPosture: Record<string, unknown>;
  goalsAndProgress: readonly Record<string, unknown>[];
  customerAndSalesPosture: Record<string, unknown>;
  collectionPosture: Record<string, unknown>;
  assetPosture: Record<string, unknown>;
  dataQuality: { completeness: number; missing: string[] };
  activeRisks: readonly unknown[];
  activeOpportunities: readonly unknown[];
  learnedCanonicalFacts: readonly Record<string, unknown>[];
  nonCanonicalHypotheses: readonly unknown[];
  confidence: "none" | "low" | "medium" | "high";
  generatedAt: string;
  sourceVersion: "company-model-v2.0";
};

export async function buildCanonicalCompanyModelV2(organizationId: string): Promise<CompanyModelV2> {
  const { prisma } = await import("@/lib/core/shared/prisma");
  const [organization, profile, units, goals, assets, payments] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.companyProfile.findUnique({ where: { organizationId } }),
    prisma.companyUnit.findMany({ where: { organizationId, active: true } }),
    prisma.salesGoal.findMany({ where: { organizationId, status: "ACTIVE" } }),
    prisma.companyAsset.findMany({ where: { organizationId, status: "ACTIVE" } }),
    prisma.payment.findMany({ where: { organizationId }, select: { amount: true, paidAmount: true, dueDate: true } }),
  ]);
  const facts = [
    ["industry", profile?.industry ?? organization.industry],
    ["city", profile?.city ?? organization.city],
    ["primary_customer_type", Array.isArray(profile?.customerTypesJson) ? profile.customerTypesJson.join(", ") : null],
    ["top_goal", goals[0]?.title ?? null],
    ["cashflow_priority", profile?.creditRiskPolicy ?? null],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1]));
  const required = ["legalName", "industry", "city", "baseCurrency"] as const;
  const missing = required.filter((key) => !profile?.[key]);
  const overdue = payments.filter((item) => item.dueDate && item.dueDate < new Date() && item.paidAmount.lt(item.amount));
  return {
    identity: { organizationId, brandName: profile?.brandName ?? organization.name, legalName: profile?.legalName, country: profile?.country ?? organization.country, city: profile?.city ?? organization.city },
    businessModel: { industry: profile?.industry ?? organization.industry, subIndustry: profile?.subIndustry, activityAreas: profile?.activityAreasJson, revenueModel: profile?.revenueModelJson, customerTypes: profile?.customerTypesJson },
    organizationStructure: { activeUnits: units.map((unit) => ({ id: unit.id, name: unit.name, type: unit.unitType, primary: unit.isPrimary })) },
    financialPosture: { baseCurrency: profile?.baseCurrency ?? "TRY", policy: profile?.creditRiskPolicy, canonicalAccountingResultAvailable: false },
    goalsAndProgress: goals.map((goal) => ({ id: goal.id, title: goal.title, scope: goal.scope, type: goal.goalType, target: goal.targetValue?.toString(), actual: goal.actualValue?.toString(), forecast: goal.forecastValue?.toString() })),
    customerAndSalesPosture: { source: "canonical-domains", assessment: null },
    collectionPosture: { receivableRecords: payments.length, overdueRecords: overdue.length },
    assetPosture: { activeAssets: assets.length, byType: Object.groupBy(assets, (asset) => asset.assetType) },
    dataQuality: { completeness: (required.length - missing.length) / required.length, missing },
    activeRisks: [],
    activeOpportunities: [],
    learnedCanonicalFacts: facts.map(([key, value]) => ({ key, value, source: "CompanyDomain", verificationStatus: "VERIFIED" })),
    nonCanonicalHypotheses: [],
    confidence: missing.length === 0 ? "high" : missing.length <= 2 ? "medium" : "low",
    generatedAt: new Date().toISOString(),
    sourceVersion: "company-model-v2.0",
  };
}

export async function buildCanonicalCompanyAuthorityProjections(organizationId: string): Promise<KnowledgeProjection[]> {
  const model = await buildCanonicalCompanyModelV2(organizationId);
  return model.learnedCanonicalFacts.flatMap((fact) =>
    evaluateKnowledgeSignal({
      producer: "SYSTEM_EVENT",
      key: String(fact.key),
      value: String(fact.value),
      epistemicType: "FACT",
      verified: true,
      durable: true,
      metadata: { sourceRef: `CompanyDomain:${organizationId}` },
    }).projections.filter((projection) => projection.target === "COMPANY_MODEL"),
  );
}
