import { listDeliveries } from "@/lib/deliveries/deliveries-client";
import { resolveDeliveryReference } from "@/lib/deliveries/delivery-resolution";
import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { deliveryHandoff } from "./conversation-extension-handoff";

// Residual Capability Parity Migration: this extension is narrowed to ONLY
// its pure navigation branches (list, create-form, open-by-reference) —
// every mutation/query capability it used to also own is retired:
//   - CREATE_FROM_ORDER -> delivery.createFromOrder (a NEW canonical
//     action wrapping createDeliveryFromOrder, deliveries.actions.ts)
//   - proof-of-delivery -> delivery.recordProof (NEW, wraps recordProofOfDelivery)
//   - exceptions        -> delivery.addException (NEW, wraps recordDeliveryException)
//   - carrier/delivery performance, shipment integrity -> delivery_carrier_performance/
//     delivery_performance/shipment_integrity Agent tools (residual-capability-tools.ts),
//     same canonical delivery-intelligence.service functions, unchanged.
// All three new actions/tools wrap the EXACT services this extension's own
// fetch calls already hit — no reimplementation.
const LIST_DELIVERIES_PATTERN = /^(?:(?:irsaliye(?:leri(?:mizi)?)?|teslimat(?:lar(?:ımızı)?)?|sevkiyat(?:lar(?:ımızı)?)?))\s+(?:g[oö]ster|listele)[.!]?$|^irsaliye\s+listesi[.!]?$/iu;
const CREATE_DELIVERY_PATTERN = /^(?:yeni\s+(?:bir\s+)?)?irsaliye\s+(?:olu[sş]tur|ekle|yarat)[.!]?$/iu;
const OPEN_DELIVERY_PATTERN = /^(.+?)\s+irsaliye(?:si|sini|nin)?\s+a[cç][.!]?$/iu;

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
