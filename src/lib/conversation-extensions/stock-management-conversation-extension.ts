import { listStock, listWarehouses, transferStockApi } from "@/lib/stock/stocks-client";
import { resolveStockReference, resolveWarehouseReference } from "@/lib/stock/stock-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { stockHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant — "stok"/"stoku"/"stoklar", "envanter", "envanteri"
const LIST_STOCK_PATTERN = /^(?:stok(?:u|lar(?:[ıi]m[ıi]z[ıi])?)?|envanter(?:i(?:mizi)?)?)\s+(?:g[oö]ster|listele)[.!]?$|^stok\s+listesi[.!]?$/iu;
const OPEN_STOCK_PATTERN = /^(.+?)\s+(?:stok|ürün[uü]n[uü]n?\s+sto[gğ]unu?)\s+a[cç][.!]?$/iu;
const TRANSFER_PATTERN = /^(.+?)[']?(?:den|dan|'den|'dan)\s+(.+?)[']?(?:ye|ya|e|a|'ye|'ya|'e|'a)\s+([\d.,]+)\s+(?:adet\s+)?(.+?)\s+ta[sş][ıi][.!]?$/iu;

function navigate(route: string, source: ConversationExtensionSource, correlationId: string) {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    route,
    source,
    correlationId,
    expectedSurfaceAuthorityKey: route.endsWith("/new") ? "stock.create.page" : "stock.list.page",
  });
}

export const stockManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `stock-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();

    if (LIST_STOCK_PATTERN.test(text)) {
      navigate("/metrix/stock", source, correlationId);
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "NAVIGATE", outcomeCode: "STOCK_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    const transferMatch = text.match(TRANSFER_PATTERN);
    if (transferMatch) {
      const fromRef = transferMatch[1]!.trim();
      const toRef = transferMatch[2]!.trim();
      const quantityStr = transferMatch[3]!.replace(",", ".");
      const productRef = transferMatch[4]!.trim();
      const quantity = parseFloat(quantityStr);
      if (isNaN(quantity) || quantity <= 0) return { status: "NOT_HANDLED", handoff: null };

      const [warehousesResp, stockResp] = await Promise.all([listWarehouses(), listStock()]);
      if (!warehousesResp.ok || !stockResp.ok) {
        return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "STOCK_LOOKUP_FAILED" }) };
      }

      const fromResolution = resolveWarehouseReference(warehousesResp.data.warehouses, fromRef);
      const toResolution = resolveWarehouseReference(warehousesResp.data.warehouses, toRef);
      const productStocks = stockResp.data.stocks.filter((s) => {
        const normalize = (v: string) => v.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/[^a-z0-9]/g, "");
        return normalize(s.productService.name).includes(normalize(productRef));
      });

      if (fromResolution.status !== "RESOLVED") return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_WAREHOUSE_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: fromResolution.status }) };
      if (toResolution.status !== "RESOLVED") return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_WAREHOUSE_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: toResolution.status }) };
      if (productStocks.length === 0) return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_PRODUCT_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      const productServiceId = productStocks[0]!.productServiceId;

      const result = await transferStockApi({ productServiceId, fromWarehouseId: fromResolution.warehouse.id, toWarehouseId: toResolution.warehouse.id, quantity });
      if (!result.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_TRANSFER_FAILED", resultStatus: "FAILED", failureCode: "STOCK_TRANSFER_FAILED" }) };

      navigate("/metrix/stock", source, correlationId);
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_TRANSFERRED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [productRef] }) };
    }

    const openMatch = text.match(OPEN_STOCK_PATTERN);
    if (openMatch) {
      const reference = openMatch[1]!.trim();
      const response = await listStock();
      if (!response.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "NAVIGATE", outcomeCode: "STOCK_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "STOCK_LOOKUP_FAILED" }) };
      const resolution = resolveStockReference(response.data.stocks, reference);
      if (resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: stockHandoff({ operation: "NAVIGATE", outcomeCode: "STOCK_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      if (resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: stockHandoff({ operation: "NAVIGATE", outcomeCode: "STOCK_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS" }) };
      navigate("/metrix/stock", source, correlationId);
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "NAVIGATE", outcomeCode: "STOCK_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [resolution.stock.productService.name] }) };
    }

    return { status: "NOT_HANDLED", handoff: null };
  },
};
