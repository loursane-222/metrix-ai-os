import {
  createUserRecord,
  findUserRecordById,
  findUserRecordByPhone,
} from "./user.repository";

import type { CreateUserInput } from "./user.types";
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
