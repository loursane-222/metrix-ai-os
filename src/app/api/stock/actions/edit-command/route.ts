import { ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { listProductServices } from "@/lib/core/products/product.service";
import { listSuppliers } from "@/lib/core/suppliers/supplier.service";
import { listWarehousesForOrganization } from "@/lib/core/stock/stock.service";
import { generateStockOperationCommandText } from "@/lib/stock/stock-operation-command-ai-adapter";
import { resolveStockOperationCommand } from "@/lib/stock/stock-operation-command-resolver";
import { STOCK_OPERATION_TABS, type StockOperationTab } from "@/lib/stock/stock-operation-command-contract";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> { try { const auth = await requireAuthContextFromCookies(); const body = await readJsonObject(request); const activeTab = requiredString(body, "activeTab"); if (!(STOCK_OPERATION_TABS as readonly string[]).includes(activeTab)) throw new Error("Geçersiz stok sekmesi."); const [products, warehouses, suppliers] = await Promise.all([listProductServices({ organizationId: auth.organization.id, type: "PRODUCT", status: "ACTIVE" }), listWarehousesForOrganization(auth.organization.id), listSuppliers({ organizationId: auth.organization.id, status: "ACTIVE" })]); const outcome = await resolveStockOperationCommand({ utterance: requiredString(body, "utterance"), activeTab: activeTab as StockOperationTab, references: { products: products.map(({ id, name }) => ({ id, name })), warehouses: warehouses.map(({ id, name, code }) => ({ id, name, code })), suppliers: suppliers.map(({ id, displayName }) => ({ id, displayName })) }, generateText: generateStockOperationCommandText }); return ok({ outcome }); } catch (error) { return mapExecutionErrorToHttpResponse(error); } }
