import { createDomainFieldRegistry } from "@/lib/edit-command/domain-field-registry";
import { resolveEditCommand, type EditCommandResolveOutcome, type GenerateEditCommandText } from "@/lib/edit-command/edit-command-resolver";
import { STOCK_OPERATION_FIELDS, validateStockOperationCommandResolution, type StockOperationCommandResolution, type StockOperationTab } from "./stock-operation-command-contract";

const STOCK_OPERATION_REGISTRY = createDomainFieldRegistry({ domain: "stocks", entityType: "StockOperation", fields: [] });
export type StockOperationReferenceData = { products: ReadonlyArray<{ id: string; name: string }>; warehouses: ReadonlyArray<{ id: string; name: string; code: string }>; suppliers: ReadonlyArray<{ id: string; displayName: string }> };
export type StockOperationCommandResolveOutcome = EditCommandResolveOutcome<StockOperationCommandResolution>;
export type GenerateStockOperationCommandText = GenerateEditCommandText;

export function buildStockOperationCommandSystemPrompt(activeTab: StockOperationTab, references: StockOperationReferenceData): string {
  const rows = <T,>(items: readonly T[], format: (item: T) => string) => items.length ? items.map(format).join("\n") : "(yok)";
  return [
    "Sen METRIX Stok İşlemleri ekranındaki komutları yorumlayan dar bir JSON sınıflandırıcısısın.", "Yalnızca TEK JSON nesnesi üret; açıklama veya markdown ekleme.",
    `Aktif sekme: ${activeTab}.`, `İzinli alanlar: ${STOCK_OPERATION_FIELDS[activeTab].join(", ")}.`,
    "Gerçek ürünler (id | ad):", rows(references.products, (item: { id: string; name: string }) => `${item.id} | ${item.name}`),
    "Gerçek depolar (id | ad | kod):", rows(references.warehouses, (item: { id: string; name: string; code: string }) => `${item.id} | ${item.name} | ${item.code}`),
    "Gerçek tedarikçiler (id | ad):", rows(references.suppliers, (item: { id: string; displayName: string }) => `${item.id} | ${item.displayName}`),
    "productServiceId, warehouseId, fromWarehouseId, toWarehouseId ve supplierId değerlerinde yalnız yukarıdaki gerçek ID'leri kullan. İsim veya depo kodunu eşleştir; eşleşme belirsizse ID uydurma ve clarification_required dön.",
    '{"result":"executable","action":"select_tab","tabId":"<receipt|transfer|warehouses>"}',
    '{"result":"executable","action":"set_field","tabId":"<sekme>","field":"<o sekmenin izinli alanı>","value":"<değer>"}',
    '{"result":"executable","action":"submit"}', '{"result":"executable","action":"discard"}', '{"result":"unsupported"}', '{"result":"clarification_required","message":"<kısa Türkçe soru>"}',
    "set_field yalnız belirtilen tabId'nin alanını kullanabilir. Bilgi soruları ve stok formu dışındaki niyetler unsupported.",
  ].join("\n");
}

export async function resolveStockOperationCommand(params: { utterance: string; activeTab: StockOperationTab; references: StockOperationReferenceData; generateText: GenerateStockOperationCommandText }): Promise<StockOperationCommandResolveOutcome> {
  const outcome = await resolveEditCommand({ domain: "stocks", fieldRegistry: STOCK_OPERATION_REGISTRY, utterance: params.utterance, activeTab: params.activeTab, generateText: params.generateText, buildSystemPrompt: () => buildStockOperationCommandSystemPrompt(params.activeTab, params.references), validateResolution: validateStockOperationCommandResolution });
  if (outcome.kind !== "resolved" || outcome.resolution.kind !== "executable" || outcome.resolution.command.type !== "set_field") return outcome;
  const { field, value } = outcome.resolution.command;
  const valid = field === "productServiceId" ? params.references.products.some((item) => item.id === value)
    : field === "supplierId" ? value === "" || params.references.suppliers.some((item) => item.id === value)
      : ["warehouseId", "fromWarehouseId", "toWarehouseId"].includes(field) ? params.references.warehouses.some((item) => item.id === value) : true;
  return valid ? outcome : { kind: "invalid_output" };
}
