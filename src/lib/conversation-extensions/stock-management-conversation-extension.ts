import { listStock } from "@/lib/stock/stocks-client";
import { resolveStockReference } from "@/lib/stock/stock-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { stockHandoff } from "./conversation-extension-handoff";

// Residual Capability Parity Migration: this extension is narrowed to ONLY
// its pure navigation branches (list, operations-form, open-by-reference)
// — every mutation/query capability it used to also own is retired:
//   - transfer                  -> stock.transfer was ALREADY a complete
//     canonical action (productServiceId/fromWarehouseId/toWarehouseId all
//     already resolvable entity references) — no new plumbing needed.
//   - physical count            -> stock.recordCount (NEW, wraps
//     recordPhysicalCount) + a NEW find_stock_by_product_and_warehouse
//     Agent tool to resolve the real stockId first
//   - confirm/dismiss variance  -> stock.resolveVariance (NEW, wraps
//     resolveInventoryVariance)
//   - health, executive signals, pending-variances list -> stock_health/
//     stock_executive_signals/list_pending_stock_variances Agent tools
//     (residual-capability-tools.ts), same canonical
//     stock-intelligence.service functions, unchanged.
// All new actions/tools wrap the EXACT services this extension's own fetch
// calls already hit — no reimplementation.
const LIST_STOCK_PATTERN = /^(?:stok(?:u|lar(?:[ıi]m[ıi]z[ıi])?)?|envanter(?:i(?:mizi)?)?)\s+(?:g[oö]ster|listele)[.!]?$|^stok\s+listesi[.!]?$/iu;
const OPEN_STOCK_OPERATIONS_PATTERN = /^(?:stok\s+(?:giri[sş]i|i[sş]lemlerini)|mal\s+kabul)\s+a[cç][.!]?$/iu;
const OPEN_STOCK_PATTERN = /^(.+?)\s+(?:stok|ürün[uü]n[uü]n?\s+sto[gğ]unu?)\s+a[cç][.!]?$/iu;

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

    if (OPEN_STOCK_OPERATIONS_PATTERN.test(text)) {
      navigate("/metrix/stock/new", source, correlationId);
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "NAVIGATE", outcomeCode: "STOCK_OPERATIONS_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    if (LIST_STOCK_PATTERN.test(text)) {
      navigate("/metrix/stock", source, correlationId);
      return { status: "HANDOFF", handoff: stockHandoff({ operation: "NAVIGATE", outcomeCode: "STOCK_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
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
