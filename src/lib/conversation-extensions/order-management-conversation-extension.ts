import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { listOrders, createOrderFromQuote } from "@/lib/orders/orders-client";
import { listQuotes } from "@/lib/offers/quotes-client";
import { resolveOrderReference } from "@/lib/orders/order-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { orderHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant patterns — "sipariş"/"siparis", "çevir"/"cevir", "dönüştür"/"donustur"
const LIST_ORDERS_PATTERN = /^(?:(?:sipari[sş]lerimizi|sipari[sş]leri|sipari[sş]))\s+(?:g[oö]ster|listele)[.!]?$|^sipari[sş]\s+listesi[.!]?$/iu;
const CREATE_ORDER_PATTERN = /^(?:yeni\s+(?:bir\s+)?)?sipari[sş]\s+(?:olu[sş]tur|ekle|yarat)[.!]?$/iu;
const OPEN_ORDER_PATTERN = /^(.+?)\s+sipari[sş](?:i|ini|n[iı])\s+a[cç][.!]?$/iu;
const CONVERT_QUOTE_PATTERN = /^(.+?)\s+teklif(?:i|ini|n[iı])\s+sipari[sş]e\s+(?:[cç]evir|d[oö]n[uü][sş]t[uü]r)[.!]?$/iu;

function navigate(route: string, source: ConversationExtensionSource, correlationId: string) {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    route,
    source,
    correlationId,
    expectedSurfaceAuthorityKey: route.endsWith("/new") ? "orders.create.page" : "orders.list.page",
  });
}

async function resolveCustomer(reference: string) {
  const response = await listCustomers();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveCustomerReference(response.data.customers, reference) } as const;
}

async function findQuoteForCustomer(customerId: string) {
  const result = await listQuotes();
  if (!result.ok) return { error: "quotes_failed" } as const;
  const candidate = result.data.quotes
    .filter((q) => q.customerId === customerId && q.status === "WON")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return candidate ? { quote: candidate } as const : { error: "not_found" } as const;
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

    const convertMatch = text.match(CONVERT_QUOTE_PATTERN);
    if (convertMatch) {
      const customerRef = convertMatch[1]!.trim();
      const found = await resolveCustomer(customerRef);
      if ("error" in found) return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: "ORDER_CONVERT_CUSTOMER_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "CUSTOMER_LOOKUP_FAILED" }) };
      if (found.resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: "ORDER_CONVERT_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      if (found.resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: "ORDER_CONVERT_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: found.resolution.options.map((o) => o.displayName) }) };

      const quoteResult = await findQuoteForCustomer(found.resolution.customer.id);
      if ("error" in quoteResult) {
        const code = quoteResult.error === "not_found" ? "ORDER_CONVERT_QUOTE_NOT_FOUND" : "ORDER_CONVERT_QUOTE_LOOKUP_FAILED";
        return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: code, resultStatus: quoteResult.error === "not_found" ? "CLARIFICATION_REQUIRED" : "FAILED" }) };
      }

      const createResult = await createOrderFromQuote(quoteResult.quote.id);
      if (!createResult.ok) return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: "ORDER_CREATE_FAILED", resultStatus: "FAILED", failureCode: "ORDER_CREATE_REQUEST_FAILED" }) };

      navigate(`/metrix/orders`, source, correlationId);
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "CREATE", outcomeCode: "ORDER_CREATED_FROM_QUOTE", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [found.resolution.customer.displayName] }) };
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
