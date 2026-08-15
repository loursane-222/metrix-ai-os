import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
import { validateCompanyUnitFormCommandResolution, type CompanyUnitFormCommandResolution } from "./company-unit-form-command-contract";
export type CompanyUnitFormContextRow = { id: string; name: string; unitType: string; isPrimary: boolean };
export type GenerateCompanyUnitFormCommandText = GenerateEditCommandText;
export type CompanyUnitFormCommandResolveOutcome = EditCommandResolveOutcome<CompanyUnitFormCommandResolution>;
const REGISTRY = createDomainFieldRegistry({ domain: "company", entityType: "CompanyUnit", fields: [] });
export function buildCompanyUnitFormCommandSystemPrompt(rows: readonly CompanyUnitFormContextRow[]): string {
  return [
    "Sen METRIX Şirket Birimi oluşturma/düzenleme formu için dar bir JSON sınıflandırıcısısın.",
    "Yalnızca TEK JSON nesnesi üret.",
    "Alanlar: name (birim adı), code (kısa kod), unitType (HEADQUARTERS/BILLING/SHIPPING/BRANCH/WAREHOUSE/FACTORY/OFFICE/OTHER), country, city, district, postalCode, addressLine1, addressLine2.",
    rows.length ? `Mevcut birimler (load_unit için) (id | ad | tür):` : null,
    ...rows.map((row) => `${row.id} | ${row.name} | ${row.unitType}`),
    '{"result":"executable","action":"set_field","field":"<alan>","value":"<değer>"}',
    '{"result":"executable","action":"load_unit","unitId":"<id>"}',
    '{"result":"executable","action":"commit"}',
    '{"result":"executable","action":"discard"}',
    '{"result":"unsupported"}',
    '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
  ].filter(Boolean).join("\n");
}
export async function resolveCompanyUnitFormCommand(params: { utterance: string; rows: readonly CompanyUnitFormContextRow[]; generateText: GenerateCompanyUnitFormCommandText }): Promise<CompanyUnitFormCommandResolveOutcome> {
  const outcome = await resolveEditCommand({ domain: "company", fieldRegistry: REGISTRY, utterance: params.utterance, activeTab: "Adresler ve Birimler", generateText: params.generateText, buildSystemPrompt: () => buildCompanyUnitFormCommandSystemPrompt(params.rows), validateResolution: validateCompanyUnitFormCommandResolution });
  if (outcome.kind === "resolved" && outcome.resolution.kind === "executable" && outcome.resolution.command.type === "load_unit") {
    const targetId = outcome.resolution.command.unitId;
    if (!params.rows.some((row) => row.id === targetId)) return { kind: "resolved", resolution: { kind: "unsupported" } };
  }
  return outcome;
}
