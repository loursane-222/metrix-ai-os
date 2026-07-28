-- AlterTable
ALTER TABLE "CustomFieldDefinition" ADD COLUMN     "approvalPolicy" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "normalizationJson" JSONB,
ADD COLUMN     "readable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reportable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
ADD COLUMN     "sensitivity" TEXT NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "sourceOfTruth" TEXT NOT NULL DEFAULT 'relation',
ADD COLUMN     "storageKind" TEXT NOT NULL DEFAULT 'custom_value',
ADD COLUMN     "uiOrder" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "uiSection" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "writable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SalesGoal" ADD COLUMN     "actualValue" DECIMAL(18,4),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'TRY',
ADD COLUMN     "forecastValue" DECIMAL(18,4),
ADD COLUMN     "goalType" TEXT NOT NULL DEFAULT 'SALES',
ADD COLUMN     "kpiDefinitionId" TEXT,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "provenanceJson" JSONB,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'COMPANY',
ADD COLUMN     "scopeRefId" TEXT,
ADD COLUMN     "targetValue" DECIMAL(18,4);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandName" TEXT,
    "legalName" TEXT,
    "shortName" TEXT,
    "companyType" TEXT,
    "foundedAt" TIMESTAMP(3),
    "country" TEXT,
    "city" TEXT,
    "primaryLanguage" TEXT NOT NULL DEFAULT 'tr',
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "description" TEXT,
    "logoRef" TEXT,
    "taxOffice" TEXT,
    "taxNumber" TEXT,
    "mersisNo" TEXT,
    "tradeRegistryNo" TEXT,
    "chamberRegistration" TEXT,
    "kepAddress" TEXT,
    "eInvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eArchiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "authorizedRepresentativesJson" JSONB,
    "officialDocumentsJson" JSONB,
    "industry" TEXT,
    "subIndustry" TEXT,
    "activityAreasJson" JSONB,
    "revenueModelJson" JSONB,
    "salesChannelsJson" JSONB,
    "customerTypesJson" JSONB,
    "servedRegionsJson" JSONB,
    "primaryMarketsJson" JSONB,
    "seasonality" TEXT,
    "criticalCostDriversJson" JSONB,
    "supplyStructure" TEXT,
    "managementContext" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'TRY',
    "currenciesJson" JSONB,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "defaultPaymentTerms" TEXT,
    "standardMaturityDays" INTEGER,
    "discountPolicy" TEXT,
    "creditRiskPolicy" TEXT,
    "profitabilityPolicy" TEXT,
    "budgetPeriod" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "source" TEXT NOT NULL DEFAULT 'USER_FORM',
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "country" TEXT,
    "city" TEXT,
    "district" TEXT,
    "postalCode" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "source" TEXT NOT NULL DEFAULT 'USER_FORM',
    "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDynamicFieldValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyUnitId" TEXT,
    "definitionId" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER_FORM',
    "sourceRef" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDynamicFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDataSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "connectionStatus" TEXT NOT NULL,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "readDataTypesJson" JSONB,
    "errorStatus" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "provenanceJson" JSONB,
    "conflictStatus" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyUnitId" TEXT,
    "assetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "acquisitionValue" DECIMAL(18,2),
    "currentBookValue" DECIMAL(18,2),
    "estimatedCurrentValue" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'USER_FORM',
    "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL,
    "calculationMethod" JSONB NOT NULL,
    "sourceDomainsJson" JSONB NOT NULL,
    "period" TEXT NOT NULL,
    "targetRelation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByType" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'WEEKLY_MANAGEMENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fixedCoreJson" JSONB NOT NULL,
    "focusedSectionJson" JSONB,
    "dynamicQuestionsJson" JSONB,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "managerUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dueRuleJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "reminderStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewerStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMetricSnapshot" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "calculationVersion" INTEGER NOT NULL,
    "sourceRecordsJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_organizationId_key" ON "CompanyProfile"("organizationId");

-- Preserve Organization as tenant identity root while creating its canonical
-- Company Domain profile projection. Safe to re-run during controlled recovery.
INSERT INTO "CompanyProfile" (
  "id", "organizationId", "brandName", "shortName", "country", "city",
  "description", "industry", "source", "provenanceJson", "updatedAt"
)
SELECT
  'company_' || "id", "id", "name", "name", "country", "city",
  "description", "industry", 'ORGANIZATION_BACKFILL',
  jsonb_build_object('sourceModel', 'Organization', 'sourceRecordId', "id", 'migration', '20260728170000_company_operating_system'),
  CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId") DO NOTHING;

-- CreateIndex
CREATE INDEX "CompanyUnit_organizationId_active_idx" ON "CompanyUnit"("organizationId", "active");

-- CreateIndex
CREATE INDEX "CompanyUnit_organizationId_unitType_idx" ON "CompanyUnit"("organizationId", "unitType");

-- CreateIndex
CREATE INDEX "CompanyDynamicFieldValue_organizationId_definitionId_idx" ON "CompanyDynamicFieldValue"("organizationId", "definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDynamicFieldValue_organizationId_companyUnitId_defin_key" ON "CompanyDynamicFieldValue"("organizationId", "companyUnitId", "definitionId");

-- CreateIndex
CREATE INDEX "CompanyDataSource_organizationId_connectionStatus_idx" ON "CompanyDataSource"("organizationId", "connectionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDataSource_organizationId_provider_sourceType_key" ON "CompanyDataSource"("organizationId", "provider", "sourceType");

-- CreateIndex
CREATE INDEX "CompanyAsset_organizationId_status_idx" ON "CompanyAsset"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CompanyAsset_organizationId_assetType_idx" ON "CompanyAsset"("organizationId", "assetType");

-- CreateIndex
CREATE INDEX "KpiDefinition_organizationId_active_idx" ON "KpiDefinition"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "KpiDefinition_organizationId_key_version_key" ON "KpiDefinition"("organizationId", "key", "version");

-- CreateIndex
CREATE INDEX "ReportTemplate_organizationId_active_idx" ON "ReportTemplate"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplateVersion_templateId_version_key" ON "ReportTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "ReportAssignment_organizationId_active_idx" ON "ReportAssignment"("organizationId", "active");

-- CreateIndex
CREATE INDEX "ReportSubmission_organizationId_status_dueDate_idx" ON "ReportSubmission"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSubmission_assignmentId_periodStart_periodEnd_key" ON "ReportSubmission"("assignmentId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ReportAnswer_submissionId_questionKey_key" ON "ReportAnswer"("submissionId", "questionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReportMetricSnapshot_submissionId_metricKey_key" ON "ReportMetricSnapshot"("submissionId", "metricKey");

-- CreateIndex
CREATE INDEX "SalesGoal_organizationId_scope_status_idx" ON "SalesGoal"("organizationId", "scope", "status");

-- AddForeignKey
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "KpiDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUnit" ADD CONSTRAINT "CompanyUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDynamicFieldValue" ADD CONSTRAINT "CompanyDynamicFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDynamicFieldValue" ADD CONSTRAINT "CompanyDynamicFieldValue_companyUnitId_fkey" FOREIGN KEY ("companyUnitId") REFERENCES "CompanyUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDynamicFieldValue" ADD CONSTRAINT "CompanyDynamicFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDataSource" ADD CONSTRAINT "CompanyDataSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAsset" ADD CONSTRAINT "CompanyAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAsset" ADD CONSTRAINT "CompanyAsset_companyUnitId_fkey" FOREIGN KEY ("companyUnitId") REFERENCES "CompanyUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDefinition" ADD CONSTRAINT "KpiDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplateVersion" ADD CONSTRAINT "ReportTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAssignment" ADD CONSTRAINT "ReportAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAssignment" ADD CONSTRAINT "ReportAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSubmission" ADD CONSTRAINT "ReportSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSubmission" ADD CONSTRAINT "ReportSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ReportAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSubmission" ADD CONSTRAINT "ReportSubmission_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ReportTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAnswer" ADD CONSTRAINT "ReportAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ReportSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMetricSnapshot" ADD CONSTRAINT "ReportMetricSnapshot_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ReportSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ActionApproval_organizationId_actionName_targetEntityType_targe" RENAME TO "ActionApproval_organizationId_actionName_targetEntityType_t_idx";

-- RenameIndex
ALTER INDEX "BusinessCandidate_organizationId_targetDomain_targetRecordId_id" RENAME TO "BusinessCandidate_organizationId_targetDomain_targetRecordI_idx";

-- RenameIndex
ALTER INDEX "BusinessCandidatePromotionReceipt_organizationId_executionId_id" RENAME TO "BusinessCandidatePromotionReceipt_organizationId_executionI_idx";

-- RenameIndex
ALTER INDEX "BusinessCandidatePromotionReceipt_organizationId_idempotencyKey" RENAME TO "BusinessCandidatePromotionReceipt_organizationId_idempotenc_key";

-- RenameIndex
ALTER INDEX "CustomFieldDefinition_organizationId_module_entityType_active_i" RENAME TO "CustomFieldDefinition_organizationId_module_entityType_acti_idx";

-- RenameIndex
ALTER INDEX "CustomerDocumentAttachment_organizationId_actorUserId_expiresAt" RENAME TO "CustomerDocumentAttachment_organizationId_actorUserId_expir_idx";
