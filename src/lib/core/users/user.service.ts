import {
  createUserRecord,
  findUserRecordById,
  findUserRecordByPhone,
  updateUserProfileRecord,
} from "./user.repository";

import type { CreateUserInput } from "./user.types";
import type { UpdateUserProfileInput } from "./user.types";
import type { UserResult } from "./user.types";

export async function createUser(input: CreateUserInput): Promise<UserResult> {
  return createUserRecord(input);
}

export async function findUserByPhone(
  phone: string,
): Promise<UserResult | null> {
  return findUserRecordByPhone(phone);
}

export async function findUserById(id: string): Promise<UserResult | null> {
  return findUserRecordById(id);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UpdateUserProfileValidationError extends Error {}

export async function updateUserProfile(
  id: string,
  patch: UpdateUserProfileInput,
): Promise<UserResult> {
  const normalized: UpdateUserProfileInput = {};

  if (patch.fullName !== undefined) {
    const trimmed = patch.fullName.trim();
    if (!trimmed) {
      throw new UpdateUserProfileValidationError("fullName must not be empty.");
    }
    normalized.fullName = trimmed;
  }

  if (patch.email !== undefined) {
    const trimmed = patch.email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      throw new UpdateUserProfileValidationError("email is invalid.");
    }
    normalized.email = trimmed;
  }

  if (patch.timezone !== undefined) {
    const trimmed = patch.timezone.trim();
    if (!trimmed) {
      throw new UpdateUserProfileValidationError("timezone must not be empty.");
    }
    normalized.timezone = trimmed;
  }

  return updateUserProfileRecord(id, normalized);
}
