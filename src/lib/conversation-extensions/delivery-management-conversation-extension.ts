import { addDeliveryException, createDeliveryFromOrder, getCarrierPerformance, getDeliveryPerformance, listDeliveries, recordDeliveryProof } from "@/lib/deliveries/deliveries-client";
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
const INTEGRITY_PATTERN = /^(.+?)\s+(?:(?:irsaliye|teslimat|sevkiyat)(?:[ıi]n|[ıi])?\s+)?(?:sevkiyat b[uü]t[uü]nl[uü][gğ][uü] nas[ıi]l|eksiksiz mi)[?!.]?$/iu;
const CARRIER_PERFORMANCE_PATTERN = /^(?:hangi ta[sş][ıi]y[ıi]c[ıi] en iyi performans g[oö]steriyor|ta[sş][ıi]y[ıi]c[ıi] performans[ıi]n[ıi] g[oö]ster)[?!.]?$/iu;
const DELIVERY_PERFORMANCE_PATTERN = /^(?:teslim performans[ıi]m[ıi]z nas[ıi]l|irsaliye zaman[ıi]nda teslim oran[ıi]m[ıi]z ne)[?!.]?$/iu;
const PROOF_CODE_PATTERN = /^(.+?)\s+(?:irsaliye|teslimat)(?:ya|a|[ıi]na|ine)?\s+teslim kan[ıi]t[ıi] ekle:\s*(.+)$/iu;
const PROOF_RECEIVER_PATTERN = /^(.+?)\s+(?:irsaliye|teslimat)?\s*teslim edildi,?\s*alan ki[sş]i\s+(.+?)[.!]?$/iu;
const EXCEPTION_PATTERN = /^(.+?)\s+(?:irsaliye|teslimat)(?:ya|a|[ıi]na|ine)?\s+istisna ekle:\s*(.+)$/iu;
const CUSTOMER_ABSENT_PATTERN = /^(.+?)\s+(?:irsaliye|teslimat)?\s*m[uü][sş]teri adreste yoktu[.!]?$/iu;

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

    if (CARRIER_PERFORMANCE_PATTERN.test(text)) {
      const result = await getCarrierPerformance();
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "QUERY", outcomeCode: result.ok ? (result.data.status === "AVAILABLE" ? "CARRIER_PERFORMANCE_FOUND" : "CARRIER_PERFORMANCE_INSUFFICIENT_DATA") : "CARRIER_PERFORMANCE_QUERY_FAILED", resultStatus: result.ok ? "OBSERVED" : "FAILED", candidateNames: result.ok ? result.data.carriers.map((carrier) => `${carrier.carrier} zamanında ${carrier.onTimeDeliveryRate?.replace("%", "yüzde ") ?? "ölçülemedi"} hasar eksik ${carrier.damageRate?.replace("%", "yüzde ") ?? "ölçülemedi"} ortalama ${carrier.averageDeliveryHours ?? "ölçülemedi"} saat`.slice(0, 120)).slice(0, 5) : [], failureCode: result.ok ? null : "CARRIER_PERFORMANCE_QUERY_FAILED" }) };
    }

    if (DELIVERY_PERFORMANCE_PATTERN.test(text)) {
      const result = await getDeliveryPerformance();
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "QUERY", outcomeCode: result.ok ? (result.data.status === "AVAILABLE" ? "DELIVERY_PERFORMANCE_FOUND" : "DELIVERY_PERFORMANCE_INSUFFICIENT_DATA") : "DELIVERY_PERFORMANCE_QUERY_FAILED", resultStatus: result.ok ? "OBSERVED" : "FAILED", candidateNames: result.ok && result.data.status === "AVAILABLE" ? [`Zamanında ${result.data.onTimeDeliveryRate?.replace("%", "yüzde ") ?? "ölçülemedi"} ilk seferde ${result.data.firstAttemptSuccessRate?.replace("%", "yüzde ") ?? "ölçülemedi"} hasar eksik ${result.data.damageRate?.replace("%", "yüzde ") ?? "ölçülemedi"}`] : [], failureCode: result.ok ? null : "DELIVERY_PERFORMANCE_QUERY_FAILED" }) };
    }

    const integrityMatch = text.match(INTEGRITY_PATTERN);
    if (integrityMatch) {
      const found = await resolveDelivery(integrityMatch[1]!.trim());
      if ("error" in found) return lookupFailed("QUERY");
      if (found.resolution.status !== "RESOLVED") return resolutionFailure(found.resolution.status, "QUERY");
      navigate(`/metrix/deliveries/${encodeURIComponent(found.resolution.delivery.id)}`, source, correlationId);
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "QUERY", outcomeCode: "SHIPMENT_INTEGRITY_FOUND", resultStatus: "OBSERVED", entityResolution: "RESOLVED", candidateNames: [found.resolution.delivery.deliveryNumber], navigationRequested: true, navigationStatus: "COMPLETED" }) };
    }

    const proofCodeMatch = text.match(PROOF_CODE_PATTERN);
    const proofReceiverMatch = text.match(PROOF_RECEIVER_PATTERN);
    if (proofCodeMatch || proofReceiverMatch) {
      const match = proofCodeMatch ?? proofReceiverMatch!;
      const found = await resolveDelivery(match[1]!.trim());
      if ("error" in found) return lookupFailed("ENRICH");
      if (found.resolution.status !== "RESOLVED") return resolutionFailure(found.resolution.status, "ENRICH");
      const proof = proofCodeMatch ? { confirmationCode: proofCodeMatch[2]!.trim(), note: proofCodeMatch[2]!.trim() } : { receiverName: proofReceiverMatch![2]!.trim() };
      const result = await recordDeliveryProof(found.resolution.delivery.id, proof);
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "ENRICH", outcomeCode: result.ok ? "DELIVERY_PROOF_RECORDED" : "DELIVERY_PROOF_FAILED", resultStatus: result.ok ? "EXECUTED" : "FAILED", entityResolution: "RESOLVED", mutationPerformed: result.ok, failureCode: result.ok ? null : "DELIVERY_PROOF_FAILED" }) };
    }

    const exceptionMatch = text.match(EXCEPTION_PATTERN) ?? text.match(CUSTOMER_ABSENT_PATTERN);
    if (exceptionMatch) {
      const found = await resolveDelivery(exceptionMatch[1]!.trim());
      if ("error" in found) return lookupFailed("ENRICH");
      if (found.resolution.status !== "RESOLVED") return resolutionFailure(found.resolution.status, "ENRICH");
      const note = exceptionMatch[2]?.trim() ?? "Müşteri adreste yoktu";
      const normalized = note.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("tr-TR");
      const category = /adreste yok/.test(normalized) ? "CUSTOMER_NOT_AT_ADDRESS" : /redd|kabul etme/.test(normalized) ? "DELIVERY_REFUSED" : /hasar/.test(normalized) ? "PRODUCT_DAMAGED" : /ara[cç]|arac|bozul/.test(normalized) ? "VEHICLE_BREAKDOWN" : /yanl[ıi]s adres|yanlis adres/.test(normalized) ? "WRONG_ADDRESS" : /eksik/.test(normalized) ? "SHORTAGE_FOUND" : /ertele/.test(normalized) ? "DELIVERY_POSTPONED" : "OTHER";
      const result = await addDeliveryException(found.resolution.delivery.id, category, note);
      return { status: "HANDOFF", handoff: deliveryHandoff({ operation: "ENRICH", outcomeCode: result.ok ? "DELIVERY_EXCEPTION_RECORDED" : "DELIVERY_EXCEPTION_FAILED", resultStatus: result.ok ? "EXECUTED" : "FAILED", entityResolution: "RESOLVED", mutationPerformed: result.ok, failureCode: result.ok ? null : "DELIVERY_EXCEPTION_FAILED" }) };
    }

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

async function resolveDelivery(reference: string) {
  const response = await listDeliveries();
  if (!response.ok) return { error: response.error } as const;
  return { resolution: resolveDeliveryReference(response.data.deliveries, reference) } as const;
}

function lookupFailed(operation: "QUERY" | "ENRICH") {
  return { status: "HANDOFF" as const, handoff: deliveryHandoff({ operation, outcomeCode: "DELIVERY_LOOKUP_FAILED", resultStatus: "FAILED", failureCode: "DELIVERY_LOOKUP_FAILED" }) };
}

function resolutionFailure(status: "NOT_FOUND" | "AMBIGUOUS", operation: "QUERY" | "ENRICH") {
  return { status: "HANDOFF" as const, handoff: deliveryHandoff({ operation, outcomeCode: status === "NOT_FOUND" ? "DELIVERY_NOT_FOUND" : "DELIVERY_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: status }) };
}
