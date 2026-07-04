import {
  createCollectionAction,
  updateCollectionActionStatus,
} from "./collection-action.repository";
import type {
  CreateCollectionActionInput,
  UpdateCollectionActionStatusInput,
} from "./collection-action.types";

export async function addCollectionAction(input: CreateCollectionActionInput) {
  return createCollectionAction(input);
}

export async function transitionCollectionActionStatus(
  input: UpdateCollectionActionStatusInput,
): Promise<void> {
  await updateCollectionActionStatus(input);
}
