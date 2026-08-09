import { getStockExecutiveSignals, getStockHealth, listPendingStockCounts, listStock, listWarehouses, recordStockCount, resolveStockCount, transferStockApi } from "@/lib/stock/stocks-client";
import { resolveStockReference, resolveWarehouseReference } from "@/lib/stock/stock-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { stockHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant — "stok"/"stoku"/"stoklar", "envanter", "envanteri"
const LIST_STOCK_PATTERN = /^(?:stok(?:u|lar(?:[ıi]m[ıi]z[ıi])?)?|envanter(?:i(?:mizi)?)?)\s+(?:g[oö]ster|listele)[.!]?$|^stok\s+listesi[.!]?$/iu;
const OPEN_STOCK_PATTERN = /^(.+?)\s+(?:stok|ürün[uü]n[uü]n?\s+sto[gğ]unu?)\s+a[cç][.!]?$/iu;
const TRANSFER_PATTERN = /^(.+?)[']?(?:den|dan|'den|'dan)\s+(.+?)[']?(?:ye|ya|e|a|'ye|'ya|'e|'a)\s+([\d.,]+)\s+(?:adet\s+)?(.+?)\s+ta[sş][ıi][.!]?$/iu;
const COUNT_AT_WAREHOUSE_PATTERN = /^(.+?)[’']?(?:da|de|ta|te)\s+(.+?)\s+say[ıi]m[ıi]\s+yapt[ıi]m[,]?\s*([\d.,]+)\s+(?:adet\s+)?[cç][ıi]kt[ıi][.!]?$/iu;
const COUNT_PRODUCT_PATTERN = /^(.+?)\s+i[cç]in\s+say[ıi]m\s*:\s*([\d.,]+)\s*(?:adet)?[.!]?$/iu;
const LIST_VARIANCES_PATTERN = /^(?:say[ıi]m\s+sapmalar[ıi]n[ıi]\s+g[oö]ster|hangi\s+[uü]r[uü]nlerde\s+say[ıi]m\s+fark[ıi]\s+var)[.!]?$/iu;
const CONFIRM_VARIANCE_PATTERN = /^say[ıi]m\s+(?:kayd[ıi]n[ıi]\s+onayla|kayd[ıi]n[ıi]\s+d[uü]zelt|fark[ıi]n[ıi]\s+onayla)[.!]?$/iu;
const DISMISS_VARIANCE_PATTERN = /^say[ıi]m\s+(?:fark[ıi]n[ıi]|kayd[ıi]n[ıi])\s+reddet(?:\s*:\s*(.+))?[.!]?$/iu;
const HEALTH_PATTERN = /^(?:stok\s+sa[gğ]l[ıi][gğ][ıi]n[ıi]\s+g[oö]ster|hangi\s+[uü]r[uü]nler\s+kritik\s+stokta|hareketsiz\s+stok\s+hangileri)[.!]?$/iu;
const EXECUTIVE_PATTERN = /^(?:y[oö]netsel\s+sinyalleri\s+g[oö]ster|risk\s+sinyallerimiz\s+ne)[.!]?$/iu;

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

    if (HEALTH_PATTERN.test(text)) {
      const result = await getStockHealth();
      if (!result.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "QUERY", outcomeCode: "STOCK_HEALTH_FAILED", resultStatus: "FAILED", failureCode: "STOCK_HEALTH_FAILED" }) };
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "QUERY", outcomeCode: "STOCK_HEALTH_FOUND", resultStatus: "OBSERVED", entityResolution: "NOT_REQUIRED", candidateNames: [result.data.healthSummary] }) };
    }

    if (EXECUTIVE_PATTERN.test(text)) {
      const result = await getStockExecutiveSignals();
      if (!result.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "QUERY", outcomeCode: "STOCK_EXECUTIVE_SIGNALS_FAILED", resultStatus: "FAILED", failureCode: "STOCK_EXECUTIVE_SIGNALS_FAILED" }) };
      const summary = `Risk ${result.data.riskSignalCount}, fırsat ${result.data.opportunitySignalCount}, operasyonel ${result.data.operationalSignalCount}, açık sayım farkı ${result.data.openVarianceCount}`;
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "QUERY", outcomeCode: "STOCK_EXECUTIVE_SIGNALS_FOUND", resultStatus: "OBSERVED", entityResolution: "NOT_REQUIRED", candidateNames: [summary] }) };
    }

    if (LIST_VARIANCES_PATTERN.test(text)) {
      const result = await listPendingStockCounts();
      if (!result.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "QUERY", outcomeCode: "STOCK_VARIANCES_FAILED", resultStatus: "FAILED", failureCode: "STOCK_VARIANCES_FAILED" }) };
      const names = result.data.records.slice(0, 5).map((record) => record.stock?.productService.name ?? record.id);
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "QUERY", outcomeCode: "STOCK_VARIANCES_FOUND", resultStatus: "OBSERVED", entityResolution: "NOT_REQUIRED", candidateNames: names }) };
    }

    const dismissMatch = text.match(DISMISS_VARIANCE_PATTERN);
    if (CONFIRM_VARIANCE_PATTERN.test(text) || dismissMatch) {
      const pending = await listPendingStockCounts();
      if (!pending.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_VARIANCE_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "STOCK_VARIANCE_LOOKUP_FAILED" }) };
      if (pending.data.records.length !== 1) return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: pending.data.records.length ? "STOCK_VARIANCE_AMBIGUOUS" : "STOCK_VARIANCE_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: pending.data.records.length ? "AMBIGUOUS" : "NOT_FOUND" }) };
      const result = await resolveStockCount(pending.data.records[0]!.id, dismissMatch ? "DISMISS" : "CONFIRM", dismissMatch?.[1]?.trim());
      if (!result.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: "STOCK_VARIANCE_RESOLVE_FAILED", resultStatus: "FAILED", failureCode: "STOCK_VARIANCE_RESOLVE_FAILED" }) };
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "UPDATE", outcomeCode: dismissMatch ? "STOCK_VARIANCE_DISMISSED" : "STOCK_VARIANCE_CORRECTED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true }) };
    }

    const warehouseCount = text.match(COUNT_AT_WAREHOUSE_PATTERN);
    const productCount = text.match(COUNT_PRODUCT_PATTERN);
    if (warehouseCount || productCount) {
      const warehouseRef = warehouseCount?.[1]?.trim();
      const productRef = (warehouseCount?.[2] ?? productCount?.[1])!.trim();
      const countedQuantity = Number((warehouseCount?.[3] ?? productCount?.[2])!.replace(",", "."));
      const response = await listStock();
      if (!response.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "CREATE", outcomeCode: "STOCK_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "STOCK_LOOKUP_FAILED" }) };
      const normalized = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/[^a-z0-9]/g, "");
      const matches = response.data.stocks.filter((stock) => normalized(stock.productService.name).includes(normalized(productRef)) && (!warehouseRef || normalized(stock.warehouse.name).includes(normalized(warehouseRef))));
      if (matches.length !== 1) return { status: "HANDOFF", handoff: stockHandoff({ operation: "CREATE", outcomeCode: matches.length ? "STOCK_COUNT_AMBIGUOUS" : "STOCK_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: matches.length ? "AMBIGUOUS" : "NOT_FOUND" }) };
      const result = await recordStockCount({ stockId: matches[0]!.id, countedQuantity });
      if (!result.ok) return { status: "HANDOFF", handoff: stockHandoff({ operation: "CREATE", outcomeCode: "STOCK_COUNT_FAILED", resultStatus: "FAILED", failureCode: "STOCK_COUNT_FAILED" }) };
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "CREATE", outcomeCode: Number(result.data.record.varianceQuantity) === 0 ? "STOCK_COUNT_NO_VARIANCE" : "STOCK_VARIANCE_RECORDED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, candidateNames: [matches[0]!.productService.name] }) };
    }

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
