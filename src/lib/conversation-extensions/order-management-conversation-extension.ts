import { listOrders } from "@/lib/orders/orders-client";
import { resolveOrderReference } from "@/lib/orders/order-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { orderHandoff } from "./conversation-extension-handoff";

// Residual Capability Parity Migration: this extension is narrowed to ONLY
// its pure navigation branches (list, create-form, open-by-reference) —
// every mutation/query capability it used to also own is retired:
//   - CONVERT_QUOTE  -> order.createFromQuote (a NEW canonical action
//     wrapping createOrderFromQuote, orders.actions.ts) + a NEW
//     find_customer_won_quote Agent tool carrying the exact same
//     "customer's most recent WON quote" filter (findQuoteForCustomer,
//     same file, ported)
//   - quantity/deadline revision -> order.revise (NEW, wraps recordOrderRevision)
//   - exceptions               -> order.addException (NEW, wraps recordOrderException)
//   - fulfillment/priority/reservation, critical-orders list, delivery
//     commitment rate -> get_order_details/list_critical_orders/
//     delivery_commitment_rate Agent tools (residual-capability-tools.ts),
//     same canonical order-intelligence.service functions, unchanged.
// All new actions/tools wrap the EXACT services this extension's own fetch
// calls already hit — no reimplementation.
const LIST_ORDERS_PATTERN = /^(?:(?:sipari[sş]lerimizi|sipari[sş]leri|sipari[sş]))\s+(?:g[oö]ster|listele)[.!]?$|^sipari[sş]\s+listesi[.!]?$/iu;
const CREATE_ORDER_PATTERN = /^(?:yeni\s+(?:bir\s+)?)?sipari[sş]\s+(?:olu[sş]tur|ekle|yarat)[.!]?$/iu;
const OPEN_ORDER_PATTERN = /^(.+?)\s+sipari[sş](?:i|ini|n[iı])\s+a[cç][.!]?$/iu;

function navigate(route: string, source: ConversationExtensionSource, correlationId: string) {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    route,
    source,
    correlationId,
    expectedSurfaceAuthorityKey: route.endsWith("/new") ? "orders.create.page" : "orders.list.page",
  });
}

export const orderManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `orders-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();

    if (LIST_ORDERS_PATTERN.test(text)) {
      navigate("/metrix/orders", source, correlationId);
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "NAVIGATE", outcomeCode: "ORDER_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    if (CREATE_ORDER_PATTERN.test(text)) {
      navigate("/metrix/orders/new", source, correlationId);
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "NAVIGATE", outcomeCode: "ORDER_CREATE_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    const openMatch = text.match(OPEN_ORDER_PATTERN);
    if (openMatch) {
      const reference = openMatch[1]!.trim();
      const response = await listOrders();
      if (!response.ok) return { status: "HANDOFF", handoff: orderHandoff({ operation: "NAVIGATE", outcomeCode: "ORDER_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "ORDER_LOOKUP_FAILED" }) };
      const resolution = resolveOrderReference(response.data.orders, reference);
      if (resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: orderHandoff({ operation: "NAVIGATE", outcomeCode: "ORDER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      if (resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: orderHandoff({ operation: "NAVIGATE", outcomeCode: "ORDER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS" }) };
      navigate("/metrix/orders", source, correlationId);
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "NAVIGATE", outcomeCode: "ORDER_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [resolution.order.orderNumber] }) };
    }

    return { status: "NOT_HANDLED", handoff: null };
  },
};
