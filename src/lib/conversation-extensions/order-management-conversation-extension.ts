import { listCustomers } from "@/lib/customers/customers-client";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { addOrderException, createOrderFromQuote, getDeliveryCommitmentRate, listOrders, reviseOrder } from "@/lib/orders/orders-client";
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
const FULFILLMENT_PATTERN = /^(.+?)\s+(?:sipari[sş](?:i|inin)?\s+)?(?:kar[sş][ıi]lama durumu ne|stoktan kar[sş][ıi]lan[ıi]yor mu)[?!.]?$/iu;
const PRIORITY_PATTERN = /^(.+?)\s+(?:sipari[sş](?:i|inin)?\s+)?[oö]nceli[gğ]i ne[?!.]?$/iu;
const CRITICAL_PATTERN = /^hangi\s+sipari[sş]ler\s+(kritik|acil)[?!.]?$/iu;
const RESERVATION_PATTERN = /^(.+?)\s+(?:sipari[sş](?:i|inin)?\s+)?rezervasyon durumu(?: ne)?[?!.]?$/iu;
const COMMITMENT_PATTERN = /^(?:teslim taahh[uü]tlerimizi ne kadar tutuyoruz|zaman[ıi]nda teslim oran[ıi]m[ıi]z ne)[?!.]?$/iu;
const QUANTITY_REVISION_PATTERN = /^(.+?)\s+sipari[sş](?:i|inin)?\s+miktar[ıi]n[ıi]\s+(\d+(?:[.,]\d+)?)\s+(?:olarak\s+)?de[gğ]i[sş]tir[.!]?$/iu;
const DEADLINE_REVISION_PATTERN = /^(.+?)\s+sipari[sş](?:i|inin)?\s+tarihini\s+(\d{4}-\d{2}-\d{2})\s+(?:olarak\s+)?de[gğ]i[sş]tir[.!]?$/iu;
const EXCEPTION_PATTERN = /^(.+?)\s+(?:sipari[sş](?:i|ine)?\s+)?istisna ekle:\s*(.+)$/iu;
const SUPPLY_DELAY_PATTERN = /^(.+?)\s+(?:sipari[sş](?:i)?\s+)?tedarik gecikmesi ya[sş][ıi]yor[.!]?$/iu;

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

async function resolveOrder(reference: string) {
  const response = await listOrders();
  if (!response.ok) return { error: "lookup_failed" } as const;
  return { resolution: resolveOrderReference(response.data.orders, reference), orders: response.data.orders } as const;
}

function resolutionFailure(status: "NOT_FOUND" | "AMBIGUOUS") {
  return { status: "HANDOFF" as const, handoff: orderHandoff({ operation: "QUERY", outcomeCode: status === "NOT_FOUND" ? "ORDER_NOT_FOUND" : "ORDER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: status }) };
}

export const orderManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `orders-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();

    if (COMMITMENT_PATTERN.test(text)) {
      const result = await getDeliveryCommitmentRate();
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "QUERY", outcomeCode: result.ok ? (result.data.rate === null ? "DELIVERY_COMMITMENT_INSUFFICIENT_DATA" : "DELIVERY_COMMITMENT_RATE_FOUND") : "DELIVERY_COMMITMENT_QUERY_FAILED", resultStatus: result.ok ? "OBSERVED" : "FAILED", candidateNames: result.ok && result.data.onTimeDeliveryRate ? [result.data.onTimeDeliveryRate] : [], failureCode: result.ok ? null : "DELIVERY_COMMITMENT_QUERY_FAILED" }) };
    }

    const criticalMatch = text.match(CRITICAL_PATTERN);
    if (criticalMatch) {
      const result = await listOrders();
      if (!result.ok) return { status: "HANDOFF", handoff: orderHandoff({ operation: "QUERY", outcomeCode: "ORDER_PRIORITY_QUERY_FAILED", resultStatus: "FAILED", failureCode: "ORDER_LOOKUP_FAILED" }) };
      const labels = criticalMatch[1]!.toLocaleLowerCase("tr-TR") === "kritik" ? ["Kritik"] : ["Kritik", "Acil"];
      const matches = result.data.orders.filter((order) => labels.includes(order.priorityLabel));
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "QUERY", outcomeCode: "PRIORITY_ORDERS_FOUND", resultStatus: "OBSERVED", entityResolution: "RESOLVED", candidateNames: matches.map((order) => order.orderNumber) }) };
    }

    for (const [pattern, outcomeCode] of [[FULFILLMENT_PATTERN, "ORDER_FULFILLMENT_FOUND"], [PRIORITY_PATTERN, "ORDER_PRIORITY_FOUND"], [RESERVATION_PATTERN, "ORDER_RESERVATION_FOUND"]] as const) {
      const match = text.match(pattern);
      if (!match) continue;
      const found = await resolveOrder(match[1]!.trim());
      if ("error" in found) return { status: "HANDOFF", handoff: orderHandoff({ operation: "QUERY", outcomeCode: "ORDER_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "ORDER_LOOKUP_FAILED" }) };
      if (found.resolution.status !== "RESOLVED") return resolutionFailure(found.resolution.status);
      navigate(`/metrix/orders/${encodeURIComponent(found.resolution.order.id)}`, source, correlationId);
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "QUERY", outcomeCode, resultStatus: "OBSERVED", entityResolution: "RESOLVED", candidateNames: [found.resolution.order.orderNumber], navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    const quantityMatch = text.match(QUANTITY_REVISION_PATTERN);
    const deadlineMatch = text.match(DEADLINE_REVISION_PATTERN);
    if (quantityMatch || deadlineMatch) {
      const match = quantityMatch ?? deadlineMatch!;
      const found = await resolveOrder(match[1]!.trim());
      if ("error" in found) return { status: "HANDOFF", handoff: orderHandoff({ operation: "UPDATE", outcomeCode: "ORDER_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "ORDER_LOOKUP_FAILED" }) };
      if (found.resolution.status !== "RESOLVED") return resolutionFailure(found.resolution.status);
      const order = found.resolution.order;
      if (quantityMatch && order.items?.length !== 1) return { status: "HANDOFF", handoff: orderHandoff({ operation: "UPDATE", outcomeCode: "ORDER_REVISION_ITEM_CLARIFICATION_REQUIRED", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "RESOLVED" }) };
      const payload = quantityMatch
        ? { changeType: "QUANTITY_CHANGED", orderItemId: order.items![0]!.id, quantity: Number(quantityMatch[2]!.replace(",", ".")), reason: "Doğal dil komutuyla miktar revizyonu" }
        : { changeType: "DEADLINE_CHANGED", deadlineAt: `${deadlineMatch![2]}T12:00:00.000Z`, reason: "Doğal dil komutuyla tarih revizyonu" };
      const result = await reviseOrder(order.id, payload);
      if (result.ok) navigate(`/metrix/orders/${encodeURIComponent(order.id)}`, source, correlationId);
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "UPDATE", outcomeCode: result.ok ? "ORDER_REVISION_RECORDED" : "ORDER_REVISION_FAILED", resultStatus: result.ok ? "EXECUTED" : "FAILED", entityResolution: "RESOLVED", mutationPerformed: result.ok, navigationRequested: result.ok, navigationStatus: result.ok ? "COMPLETED" : "NOT_REQUESTED", failureCode: result.ok ? null : "ORDER_REVISION_FAILED" }) };
    }

    const exceptionMatch = text.match(EXCEPTION_PATTERN) ?? text.match(SUPPLY_DELAY_PATTERN);
    if (exceptionMatch) {
      const found = await resolveOrder(exceptionMatch[1]!.trim());
      if ("error" in found) return { status: "HANDOFF", handoff: orderHandoff({ operation: "ENRICH", outcomeCode: "ORDER_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "ORDER_LOOKUP_FAILED" }) };
      if (found.resolution.status !== "RESOLVED") return resolutionFailure(found.resolution.status);
      const note = exceptionMatch[2]?.trim() ?? "Tedarik gecikmesi";
      const normalized = note.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("tr-TR");
      const category = /tedarik/.test(normalized) ? "SUPPLY_DELAY" : /kalite/.test(normalized) ? "QUALITY_ISSUE" : /odeme/.test(normalized) ? "PAYMENT_HOLD" : /sevkiyat|teslim/.test(normalized) ? "SHIPMENT_DELAYED" : /adres/.test(normalized) ? "CUSTOMER_ADDRESS_CHANGED" : "OTHER";
      const result = await addOrderException(found.resolution.order.id, category, note);
      return { status: "HANDOFF", handoff: orderHandoff({ operation: "ENRICH", outcomeCode: result.ok ? "ORDER_EXCEPTION_RECORDED" : "ORDER_EXCEPTION_FAILED", resultStatus: result.ok ? "EXECUTED" : "FAILED", entityResolution: "RESOLVED", mutationPerformed: result.ok, failureCode: result.ok ? null : "ORDER_EXCEPTION_FAILED" }) };
    }

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
