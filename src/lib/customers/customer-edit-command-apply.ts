// Translates one validated CustomerEditCommand into the same
// executeSurfaceAction() calls CustomerEditScreen itself would issue,
// against whichever runtime instance the command channel hands it. Never
// touches React, never creates a runtime — this module only knows the
// runtime's public getState()/executeSurfaceAction() surface (see
// CustomerEditSurfaceRuntimeAdapter below), so a fake in a test is exactly
// as valid a target as the real production instance.
//
// "discard" is deliberately NOT the registry's draft.discard SURFACE action
// (that clears the draft entirely and leaves the screen with no draft to
// edit — see customer-edit-surface-runtime.ts's discard()/dispose()). It is
// a Customer-Edit-specific adapter built from the existing draft.revert_field
// action, applied once per currently dirty field, which restores the
// baseline while leaving the draft (and the screen) usable — the same
// "Iptal et" semantics CustomerEditScreen's own UI would need if it had a
// cancel button today.

import {
  customerEditCommandFieldPathToString,
  type CustomerEditCommand,
  type CustomerEditCommandExecutionResult,
} from "./customer-edit-command-contract";
import { customerToDraftFieldValues, EMPTY_CUSTOMER_EDIT_ADDRESS, type CustomerEditAddress } from "./customer-edit-draft";
import type { CustomerEditSurfaceState, SurfaceActionInput } from "./customer-edit-surface-runtime";

/** Minimal duck-typed surface this module (and the command channel) needs from a mounted CustomerEditSurfaceRuntime instance. */
export type CustomerEditSurfaceRuntimeAdapter = {
  getState: () => CustomerEditSurfaceState;
  executeSurfaceAction: (action: SurfaceActionInput) => Promise<void>;
};

function readAddress(state: CustomerEditSurfaceState, addressKind: "billingAddress" | "shippingAddress"): CustomerEditAddress {
  const value = state.draftSnapshot?.fieldValues[addressKind];
  return (value as CustomerEditAddress | undefined) ?? EMPTY_CUSTOMER_EDIT_ADDRESS;
}

export async function applyCustomerEditCommand(
  command: CustomerEditCommand,
  runtime: CustomerEditSurfaceRuntimeAdapter,
): Promise<CustomerEditCommandExecutionResult> {
  switch (command.type) {
    case "select_tab": {
      await runtime.executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: command.tabId } });
      return { status: "EXECUTED", command, appliedField: "activeTab", appliedValue: command.tabId };
    }

    case "set_field": {
      if (command.field.kind === "top") {
        await runtime.executeSurfaceAction({
          actionName: "draft.set_field",
          payload: { fieldName: command.field.field, value: command.value },
        });
        return { status: "EXECUTED", command, appliedField: command.field.field, appliedValue: command.value };
      }

      // Contract validation (isValidFieldValue) already guarantees an address
      // field's value is a string — value's type here is the set_field
      // command's general string|boolean, not yet narrowed by field.kind.
      const current = readAddress(runtime.getState(), command.field.addressKind);
      const merged: CustomerEditAddress = { ...current, [command.field.property]: command.value as string };
      await runtime.executeSurfaceAction({
        actionName: "draft.set_field",
        payload: { fieldName: command.field.addressKind, value: merged },
      });
      return {
        status: "EXECUTED",
        command,
        appliedField: customerEditCommandFieldPathToString(command.field),
        appliedValue: command.value,
      };
    }

    case "clear_field": {
      if (command.field.kind === "top") {
        await runtime.executeSurfaceAction({ actionName: "draft.clear_field", payload: { fieldName: command.field.field } });
        return { status: "EXECUTED", command, appliedField: command.field.field, appliedValue: null };
      }

      // Address properties are typed as plain strings (never nullable) — clearing
      // one means setting it to "", same as clearing an input by hand, not
      // nulling the whole address object out from under the other properties.
      const current = readAddress(runtime.getState(), command.field.addressKind);
      const merged: CustomerEditAddress = { ...current, [command.field.property]: "" };
      await runtime.executeSurfaceAction({
        actionName: "draft.set_field",
        payload: { fieldName: command.field.addressKind, value: merged },
      });
      return {
        status: "EXECUTED",
        command,
        appliedField: customerEditCommandFieldPathToString(command.field),
        appliedValue: "",
      };
    }

    case "revert_field": {
      if (command.field.kind === "top") {
        await runtime.executeSurfaceAction({ actionName: "draft.revert_field", payload: { fieldName: command.field.field } });
        return { status: "EXECUTED", command, appliedField: command.field.field };
      }

      const state = runtime.getState();
      if (!state.customer) {
        return { status: "EXECUTION_FAILED", error: "Musteri henuz yuklenmedi." };
      }
      const baselineAddress = customerToDraftFieldValues(state.customer)[command.field.addressKind];
      const current = readAddress(state, command.field.addressKind);
      const revertedValue = baselineAddress[command.field.property];
      const merged: CustomerEditAddress = { ...current, [command.field.property]: revertedValue };
      await runtime.executeSurfaceAction({
        actionName: "draft.set_field",
        payload: { fieldName: command.field.addressKind, value: merged },
      });
      return {
        status: "EXECUTED",
        command,
        appliedField: customerEditCommandFieldPathToString(command.field),
        appliedValue: revertedValue,
      };
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
      const state = runtime.getState();
      const dirtyFields = state.draftSnapshot?.dirtyFields ?? [];
      for (const fieldName of dirtyFields) {
        await runtime.executeSurfaceAction({ actionName: "draft.revert_field", payload: { fieldName } });
      }
      return { status: "EXECUTED", command, revertedFields: [...dirtyFields] };
    }
  }
}
