import { listDeliveries, createDeliveryFromOrder } from "@/lib/deliveries/deliveries-client";
import { resolveDeliveryReference } from "@/lib/deliveries/delivery-resolution";
import { listOrders } from "@/lib/orders/orders-client";
import { resolveOrderReference } from "@/lib/orders/order-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { deliveryHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant patterns — "irsaliye"/"irsaliye", "teslimat"/"teslimat", "sevkiyat"/"sevkiyat"
const LIST_DELIVERIES_PATTERN = /^(?:(?:irsaliye(?:leri(?:mizi)?)?|teslimat(?:lar(?:ımızı)?)?|sevkiyat(?:lar(?:ımızı)?)?))\s+(?:g[oö]ster|listele)[.!]?$|^irsaliye\s+listesi[.!]?$/iu;
const CREATE_DELIVERY_PATTERN = /^(?:yeni\s+(?:bir\s+)?)?irsaliye\s+(?:olu[sş]tur|ekle|yarat)[.!]?$/iu;
const OPEN_DELIVERY_PATTERN = /^(.+?)\s+irsaliye(?:si|sini|nin)?\s+a[cç][.!]?$/iu;
const CREATE_FROM_ORDER_PATTERN = /^(.+?)\s+sipari[sş](?:i|ini|n[iı])?\s+(?:irsaliye(?:ye\s+d[oö]n[uü][sş]t[uü]r|le[sş]tir)|g[oö]nder)[.!]?$/iu;

function navigate(route: string, source: ConversationExtensionSource, correlationId: string) {
  if (typeof window === "undefined") return;
  void dispatchConversationNavigation({
    route,
    source,
    correlationId,
    expectedSurfaceAuthorityKey: route.endsWith("/new") ? "deliveries.create.page" : "deliveries.list.page",
  });
}

export const deliveryManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey() {
    return typeof window === "undefined" ? null : `deliveries-management:${window.location.pathname}`;
  },

  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();

    if (LIST_DELIVERIES_PATTERN.test(text)) {
      navigate("/metrix/deliveries", source, correlationId);
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "NAVIGATE", outcomeCode: "DELIVERY_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    if (CREATE_DELIVERY_PATTERN.test(text)) {
      navigate("/metrix/deliveries/new", source, correlationId);
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "NAVIGATE", outcomeCode: "DELIVERY_CREATE_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    const convertMatch = text.match(CREATE_FROM_ORDER_PATTERN);
    if (convertMatch) {
      const orderRef = convertMatch[1]!.trim();
      const response = await listOrders();
      if (!response.ok) return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "CREATE", outcomeCode: "DELIVERY_ORDER_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "ORDER_LOOKUP_FAILED" }) };
      const resolution = resolveOrderReference(response.data.orders, orderRef);
      if (resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "CREATE", outcomeCode: "DELIVERY_ORDER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      if (resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "CREATE", outcomeCode: "DELIVERY_ORDER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS" }) };

      const createResult = await createDeliveryFromOrder(resolution.order.id, true);
      if (!createResult.ok) return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "CREATE", outcomeCode: "DELIVERY_CREATE_FAILED", resultStatus: "FAILED", failureCode: "DELIVERY_CREATE_REQUEST_FAILED" }) };

      navigate("/metrix/deliveries", source, correlationId);
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "CREATE", outcomeCode: "DELIVERY_CREATED_FROM_ORDER", resultStatus: "EXECUTED", entityResolution: "RESOLVED", mutationPerformed: true, navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [resolution.order.orderNumber] }) };
    }

    const openMatch = text.match(OPEN_DELIVERY_PATTERN);
    if (openMatch) {
      const reference = openMatch[1]!.trim();
      const response = await listDeliveries();
      if (!response.ok) return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "NAVIGATE", outcomeCode: "DELIVERY_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "DELIVERY_LOOKUP_FAILED" }) };
      const resolution = resolveDeliveryReference(response.data.deliveries, reference);
      if (resolution.status === "NOT_FOUND") return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "NAVIGATE", outcomeCode: "DELIVERY_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" }) };
      if (resolution.status === "AMBIGUOUS") return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "NAVIGATE", outcomeCode: "DELIVERY_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS" }) };
      navigate("/metrix/deliveries", source, correlationId);
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "NAVIGATE", outcomeCode: "DELIVERY_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED", candidateNames: [resolution.delivery.deliveryNumber] }) };
    }

    return { status: "NOT_HANDLED", handoff: null };
  },
};
