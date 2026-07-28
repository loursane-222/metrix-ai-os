import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Company completion production contracts", () => {
  const screen = read("src/components/company/CompanyOperatingScreen.tsx");
  const companyRoute = read("src/app/api/company/route.ts");
  const unitRoute = read("src/app/api/company/units/[unitId]/route.ts");
  const fieldRoute = read("src/app/api/company/field-definitions/actions/create/route.ts");
  const reportService = read("src/lib/company/company-report.service.ts");
  const candidateExecutor = read("src/lib/business-reality-candidates/business-candidate-action-runtime.executor.ts");

  it("uses canonical Company APIs and never demo/localStorage Workspace state", () => {
    expect(screen).toContain('api("/api/company")');
    expect(screen).not.toMatch(/localStorage|MetrixWorkspace|blankData|companyProfile.*useState/);
    expect(companyRoute).toContain("requireAuthContextFromCookies()");
    expect(companyRoute).not.toMatch(/organizationId.*body/);
  });
  it("provides separated production editors for every required Company section", () => {
    for (const section of ["Kimlik ve İletişim", "Adresler ve Birimler", "Resmî Bilgiler", "İş Modeli", "Finansal Ayarlar", "Hedefler", "Varlıklar", "Haftalık Raporlar", "Entegrasyonlar", "Sistem Bilgileri"]) expect(screen).toContain(section);
    expect(screen).toContain("CandidateProfileForm");
    expect(screen).toContain("Business Candidate oluşturuldu");
  });
  it("enforces unit tenant scope and history-preserving deactivation", () => {
    expect(unitRoute).toContain("auth.organization.id");
    expect(unitRoute).toContain("setCompanyUnitActive");
    const service = read("src/lib/company/company.service.ts");
    expect(service).toContain("preservedLinkedAssets");
    expect(service).toContain("preservedDynamicValues");
    expect(service).not.toContain("companyUnit.delete");
  });
  it("uses the shared field authority with explicit approval", () => {
    expect(fieldRoute).toContain("handleCustomFieldActionRoute");
    expect(fieldRoute).toContain('module: "company"');
    expect(screen).toContain('phase: "REQUEST"');
    expect(screen).toContain('phase: "CONFIRM"');
    expect(read("prisma/schema.prisma").match(/model CustomFieldDefinition \{/g)).toHaveLength(1);
  });
  it("promotes Company field definitions and values only through the existing Candidate executor", () => {
    expect(candidateExecutor).toContain('input.targetDomain === "CustomFieldDefinition"');
    expect(candidateExecutor).toContain('input.targetDomain === "CompanyDynamicFieldValue"');
    expect(candidateExecutor).toContain("company.field_definition.create");
    expect(candidateExecutor).toContain("company.field_value.write");
  });
  it("versions weekly templates and never mutates prior submissions", () => {
    expect(reportService).toContain("reportTemplateVersion.create");
    expect(reportService).toContain("(latest?.version ?? 0) + 1");
    expect(reportService).not.toContain("reportSubmission.update");
    expect(screen).toContain("immutable version");
  });
  it("keeps critical official and financial mutations behind Candidate approval", () => {
    expect(screen).toContain('targetDomain: "CompanyProfile"');
    expect(companyRoute).toContain("Resmî alan değişiklikleri Business Candidate");
  });
  it("keeps mobile navigation usable without a horizontal tab stack", () => {
    expect(screen).toContain('aria-label="Şirketim bölümü"');
    expect(screen).toContain("overflow-x-hidden");
    expect(screen).toContain("lg:hidden");
  });
});
