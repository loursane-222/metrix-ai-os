import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
import { validateCompanyUnitActionCommandResolution, type CompanyUnitActionCommandResolution } from "./company-unit-action-command-contract";
export type CompanyUnitContextRow = { id: string; name: string; unitType: string; isPrimary: boolean };
export type GenerateCompanyUnitActionCommandText = GenerateEditCommandText;
export type CompanyUnitActionCommandResolveOutcome = EditCommandResolveOutcome<CompanyUnitActionCommandResolution>;
const REGISTRY = createDomainFieldRegistry({ domain: "company", entityType: "CompanyUnit", fields: [] });
export function buildCompanyUnitActionCommandSystemPrompt(rows: readonly CompanyUnitContextRow[]): string {
  return ["Sen METRIX Şirket Birimi listesi için dar bir JSON sınıflandırıcısısın.", "Gerçek birimler (id | ad | tür | primary):", ...rows.map((row) => `${row.id} | ${row.name} | ${row.unitType} | ${row.isPrimary ? "primary" : "-"}`), "Yalnız listede gerçekten var olan id kullan. Hedef belirsizse clarification_required.", '{"result":"executable","action":"make_primary","unitId":"<id>"}', '{"result":"executable","action":"deactivate","unitId":"<id>"}', '{"result":"unsupported"}', '{"result":"clarification_required","message":"<kısa Türkçe soru>"}'].join("\n");
}
export async function resolveCompanyUnitActionCommand(params: { utterance: string; rows: readonly CompanyUnitContextRow[]; generateText: GenerateCompanyUnitActionCommandText }): Promise<CompanyUnitActionCommandResolveOutcome> {
  const outcome = await resolveEditCommand({ domain: "company", fieldRegistry: REGISTRY, utterance: params.utterance, activeTab: "Adresler ve Birimler", generateText: params.generateText, buildSystemPrompt: () => buildCompanyUnitActionCommandSystemPrompt(params.rows), validateResolution: validateCompanyUnitActionCommandResolution });
  if (outcome.kind === "resolved" && outcome.resolution.kind === "executable") { const targetId = outcome.resolution.command.unitId; if (!params.rows.some((row) => row.id === targetId)) return { kind: "resolved", resolution: { kind: "unsupported" } }; }
  return outcome;
}
