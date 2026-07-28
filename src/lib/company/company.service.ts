import { prisma } from "@/lib/core/shared/prisma";

const PROFILE_COMPLETENESS_FIELDS = [
  "brandName", "legalName", "companyType", "country", "city", "website", "phone",
  "email", "industry", "activityAreasJson", "baseCurrency", "fiscalYearStartMonth",
] as const;

export async function getCompanyOverview(organizationId: string) {
  const [organization, profile, units, dataSources, goals, assets, pendingCandidates, reports] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.companyProfile.findUnique({ where: { organizationId } }),
    prisma.companyUnit.findMany({ where: { organizationId, active: true }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }),
    prisma.companyDataSource.findMany({ where: { organizationId }, orderBy: { priority: "asc" } }),
    prisma.salesGoal.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    prisma.companyAsset.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    prisma.businessCandidate.count({ where: { organizationId, targetDomain: { in: ["company", "CompanyProfile", "CompanyUnit"] }, status: { in: ["PROPOSED", "PENDING_APPROVAL", "PARTIALLY_APPROVED", "APPROVED"] } } }),
    prisma.reportSubmission.findMany({ where: { organizationId }, orderBy: { dueDate: "desc" }, take: 20 }),
  ]);
  const effective = profile ?? {
    brandName: organization.name,
    legalName: null,
    companyType: null,
    country: organization.country,
    city: organization.city,
    website: null,
    phone: null,
    email: null,
    industry: organization.industry,
    activityAreasJson: null,
    baseCurrency: "TRY",
    fiscalYearStartMonth: 1,
    updatedAt: organization.updatedAt,
  };
  const completed = PROFILE_COMPLETENESS_FIELDS.filter((key) => effective[key] !== null && effective[key] !== "").length;
  return {
    organization: { id: organization.id, name: organization.name },
    profile: effective,
    units,
    dataSources,
    goals: goals.map((goal) => ({
      ...goal,
      targetRevenueCents: goal.targetRevenueCents?.toString() ?? null,
      targetCollectionCents: goal.targetCollectionCents?.toString() ?? null,
      targetValue: goal.targetValue?.toString() ?? null,
      actualValue: goal.actualValue?.toString() ?? null,
      forecastValue: goal.forecastValue?.toString() ?? null,
    })),
    assets: assets.map((asset) => ({
      ...asset,
      acquisitionValue: asset.acquisitionValue?.toString() ?? null,
      currentBookValue: asset.currentBookValue?.toString() ?? null,
      estimatedCurrentValue: asset.estimatedCurrentValue?.toString() ?? null,
    })),
    reports,
    indicators: {
      profileReadiness: Math.round((completed / PROFILE_COMPLETENESS_FIELDS.length) * 100),
      activeGoals: goals.length,
      openManagementIssues: pendingCandidates + reports.filter((item) => item.status !== "SUBMITTED" && item.dueDate < new Date()).length,
      connectedDataSources: dataSources.filter((item) => item.connectionStatus === "CONNECTED").length,
      pendingCandidates,
    },
    financial: await getCompanyFinancialProjection(organizationId, profile?.baseCurrency ?? "TRY"),
  };
}

export async function updateCompanyProfile(
  organizationId: string,
  actorUserId: string,
  values: Record<string, unknown>,
  approvedCandidate = false,
) {
  const allowed: readonly string[] = [
    "brandName", "legalName", "shortName", "companyType", "foundedAt", "country", "city",
    "primaryLanguage", "website", "phone", "email", "description", "logoRef", "industry",
    "subIndustry", "activityAreasJson", "revenueModelJson", "salesChannelsJson", "customerTypesJson",
    "servedRegionsJson", "primaryMarketsJson", "seasonality", "criticalCostDriversJson",
    "supplyStructure", "managementContext", "baseCurrency", "currenciesJson", "fiscalYearStartMonth",
    "defaultPaymentTerms", "standardMaturityDays", "discountPolicy", "creditRiskPolicy",
    "profitabilityPolicy", "budgetPeriod",
    ...(approvedCandidate ? ["taxOffice", "taxNumber", "mersisNo", "tradeRegistryNo", "chamberRegistration", "kepAddress", "eInvoiceEnabled", "eArchiveEnabled", "authorizedRepresentativesJson", "officialDocumentsJson"] : []),
  ];
  const data = Object.fromEntries(allowed.filter((key) => values[key] !== undefined).map((key) => [key, values[key]]));
  return prisma.companyProfile.upsert({
    where: { organizationId },
    create: {
      organizationId,
      ...data,
      source: "USER_FORM",
      provenanceJson: { actorUserId, channel: "company_ui", verifiedAt: new Date().toISOString() },
    },
    update: {
      ...data,
      source: "USER_FORM",
      provenanceJson: { actorUserId, channel: "company_ui", verifiedAt: new Date().toISOString() },
    },
  });
}

export async function createCompanyUnit(organizationId: string, values: Record<string, unknown>) {
  return prisma.companyUnit.create({
    data: {
      organizationId,
      unitType: String(values.unitType ?? "OTHER"),
      name: String(values.name ?? ""),
      code: typeof values.code === "string" ? values.code : undefined,
      isPrimary: values.isPrimary === true,
      country: typeof values.country === "string" ? values.country : undefined,
      city: typeof values.city === "string" ? values.city : undefined,
      district: typeof values.district === "string" ? values.district : undefined,
      postalCode: typeof values.postalCode === "string" ? values.postalCode : undefined,
      addressLine1: typeof values.addressLine1 === "string" ? values.addressLine1 : undefined,
      addressLine2: typeof values.addressLine2 === "string" ? values.addressLine2 : undefined,
      provenanceJson: values.provenance ?? { channel: "company_ui" },
    },
  });
}

export async function getCompanyFinancialProjection(organizationId: string, currency: string) {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [expenses, payments] = await Promise.all([
    prisma.expense.findMany({ where: { organizationId, currency, expenseDate: { gte: periodStart, lte: now }, status: { not: "CANCELLED" } }, select: { id: true, amount: true, category: true, status: true } }),
    prisma.payment.findMany({ where: { organizationId, currency }, select: { id: true, amount: true, paidAmount: true, dueDate: true, status: true } }),
  ]);
  const operatingExpenses = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalReceivables = payments.reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paidAmount)), 0);
  const totalCollections = payments.reduce((sum, item) => sum + Number(item.paidAmount), 0);
  const overdueReceivables = payments
    .filter((item) => item.dueDate && item.dueDate < now && Number(item.paidAmount) < Number(item.amount))
    .reduce((sum, item) => sum + Number(item.amount) - Number(item.paidAmount), 0);
  const sources = [...expenses.map((x) => `Expense:${x.id}`), ...payments.map((x) => `Payment:${x.id}`)];
  const available = (value: number, sourceCount: number) => ({
    value: sourceCount ? value : null,
    status: sourceCount ? "AVAILABLE" : "NO_DATA",
    calculationKey: "company_management_v1",
    calculationVersion: 1,
    sourceRecords: sources,
    period: { from: periodStart.toISOString(), to: now.toISOString() },
    currency,
    generatedAt: now.toISOString(),
    completeness: sourceCount ? 1 : 0,
    basis: "ACTUAL",
  });
  return {
    accountingResult: null,
    managementView: {
      revenue: available(0, 0),
      directCost: available(0, 0),
      grossProfit: available(0, 0),
      operatingExpenses: available(operatingExpenses, expenses.length),
      operatingResult: available(0, 0),
      estimatedNetResult: available(0, 0),
      totalReceivables: available(totalReceivables, payments.length),
      overdueReceivables: available(overdueReceivables, payments.length),
      totalCollections: available(totalCollections, payments.length),
      totalPayables: available(0, 0),
      cashPosition: available(0, 0),
      budgetVariance: available(0, 0),
      breakEven: available(0, 0),
    },
  };
}
