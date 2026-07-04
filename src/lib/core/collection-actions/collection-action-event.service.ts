import { createCollectionActionEvent } from "./collection-action-event.repository";
import type { CollectionActionStatus } from "./collection-action.types";

export async function logActionCreated(input: {
  organizationId: string;
  collectionActionId: string;
  aiReason: string | null;
}): Promise<void> {
  await createCollectionActionEvent({
    organizationId: input.organizationId,
    collectionActionId: input.collectionActionId,
    eventType: "ACTION_CREATED",
    note: input.aiReason ?? "Aksiyon oluşturuldu.",
    source: "AI_SUGGESTED",
  });
}

export async function logStatusChanged(input: {
  organizationId: string;
  collectionActionId: string;
  conversationId?: string | null;
  fromStatus: CollectionActionStatus;
  toStatus: CollectionActionStatus;
}): Promise<void> {
  await createCollectionActionEvent({
    organizationId: input.organizationId,
    collectionActionId: input.collectionActionId,
    conversationId: input.conversationId,
    eventType: "STATUS_CHANGED",
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    source: "AI_SUGGESTED",
  });
}

export async function logContactLogged(input: {
  organizationId: string;
  collectionActionId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createCollectionActionEvent({
    organizationId: input.organizationId,
    collectionActionId: input.collectionActionId,
    conversationId: input.conversationId,
    eventType: "CONTACT_LOGGED",
    note: "İletişime geçildi.",
    source: "AI_SUGGESTED",
  });
}

export async function logPaymentPromised(input: {
  organizationId: string;
  collectionActionId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createCollectionActionEvent({
    organizationId: input.organizationId,
    collectionActionId: input.collectionActionId,
    conversationId: input.conversationId,
    eventType: "PAYMENT_PROMISED",
    note: "Ödeme sözü alındı.",
    source: "AI_SUGGESTED",
  });
}

export async function logPaymentDateSet(input: {
  organizationId: string;
  collectionActionId: string;
  conversationId?: string | null;
  expectedDate: Date;
}): Promise<void> {
  await createCollectionActionEvent({
    organizationId: input.organizationId,
    collectionActionId: input.collectionActionId,
    conversationId: input.conversationId,
    eventType: "PAYMENT_DATE_SET",
    note: `Beklenen ödeme tarihi: ${input.expectedDate.toISOString().slice(0, 10)}.`,
    expectedDate: input.expectedDate,
    source: "AI_SUGGESTED",
  });
}

export async function logPaymentConfirmed(input: {
  organizationId: string;
  collectionActionId: string;
  conversationId?: string | null;
}): Promise<void> {
  await createCollectionActionEvent({
    organizationId: input.organizationId,
    collectionActionId: input.collectionActionId,
    conversationId: input.conversationId,
    eventType: "PAYMENT_CONFIRMED",
    note: "Ödeme onaylandı.",
    source: "AI_SUGGESTED",
  });
}
