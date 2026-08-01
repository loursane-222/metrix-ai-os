// Translates one validated OfferEditCommand into the same
// executeSurfaceAction() calls OfferEditScreen itself would issue, against
// whichever runtime instance the command channel hands it. Mirrors
// customer-edit-command-apply.ts: never touches React, never creates a
// runtime — only knows the runtime's public getState()/executeSurfaceAction()
// surface, so a fake in a test is exactly as valid a target as production.

import type { OfferEditCommand, OfferEditCommandExecutionResult } from "./offer-edit-command-contract";
import type { OfferEditFieldValues, OfferEditItemLine } from "./offer-edit-draft";
import type { OfferEditSurfaceState, SurfaceActionInput } from "./offer-edit-surface-runtime";

export type OfferEditSurfaceRuntimeAdapter = {
  getState: () => OfferEditSurfaceState;
  executeSurfaceAction: (action: SurfaceActionInput) => Promise<void>;
};

function readItems(state: OfferEditSurfaceState): OfferEditItemLine[] {
  const values = state.draftSnapshot?.fieldValues as OfferEditFieldValues | undefined;
  return values?.items ?? [];
}

export async function applyOfferEditCommand(
  command: OfferEditCommand,
  runtime: OfferEditSurfaceRuntimeAdapter,
): Promise<OfferEditCommandExecutionResult> {
  switch (command.type) {
    case "select_tab": {
      await runtime.executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: command.tabId } });
      return { status: "EXECUTED", command };
    }

    case "add_item": {
      const current = readItems(runtime.getState());
      const line: OfferEditItemLine = {
        localId: crypto.randomUUID(),
        productServiceId: null,
        name: command.name,
        unit: command.unit ?? "",
        quantity: command.quantity,
        unitPrice: command.unitPrice,
        discountPercent: command.discountPercent ?? 0,
        vatPercent: command.vatPercent ?? 0,
      };
      await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "items", value: [...current, line] } });
      return { status: "EXECUTED", command };
    }

    case "remove_last_item": {
      const current = readItems(runtime.getState());
      if (current.length === 0) {
        return { status: "EXECUTION_FAILED", error: "Teklifte silinecek kalem yok." };
      }
      await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "items", value: current.slice(0, -1) } });
      return { status: "EXECUTED", command };
    }

    case "set_item_price": {
      const current = readItems(runtime.getState());
      if (current.length === 0) {
        return { status: "EXECUTION_FAILED", error: "Teklifte fiyatı değiştirilecek kalem yok." };
      }
      const targetIndex = command.itemName
        ? current.findIndex((item) => item.name.toLocaleLowerCase("tr-TR").includes(command.itemName!.toLocaleLowerCase("tr-TR")))
        : current.length - 1;
      if (targetIndex === -1) {
        return { status: "EXECUTION_FAILED", error: `"${command.itemName}" adlı kalem bulunamadı.` };
      }
      const updated = current.map((item, index) => (index === targetIndex ? { ...item, unitPrice: command.unitPrice } : item));
      await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "items", value: updated } });
      return { status: "EXECUTED", command };
    }

    case "set_general_discount": {
      await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "generalDiscountPercent", value: command.percent } });
      return { status: "EXECUTED", command };
    }

    case "set_field": {
      await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: command.field, value: command.value } });
      return { status: "EXECUTED", command };
    }

    case "commit": {
      const before = runtime.getState();
      await runtime.executeSurfaceAction({ actionName: "draft.commit" });
      const after = runtime.getState();

      if (after.saveError && after.saveError !== before.saveError) {
        return { status: "EXECUTION_FAILED", error: after.saveError };
      }
      if (after.blockingMessage && after.blockingMessage !== before.blockingMessage) {
        return { status: "EXECUTED", command, commitOutcome: "SAVED_REFRESH_FAILED" };
      }
      return { status: "EXECUTED", command, commitOutcome: "SAVED" };
    }

    case "discard": {
      await runtime.executeSurfaceAction({ actionName: "draft.discard" });
      return { status: "EXECUTED", command };
    }
  }
}
