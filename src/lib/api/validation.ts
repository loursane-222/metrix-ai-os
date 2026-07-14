export type RequestBody = Record<string, unknown>;

export class ApiValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiValidationError";
    this.status = status;
  }
}

export async function readJsonObject(request: Request): Promise<RequestBody> {
  let body: unknown;

  try {
    body = (await request.json()) as unknown;
  } catch {
    throw new ApiValidationError("Invalid JSON body.");
  }

  if (!isRecord(body)) {
    throw new ApiValidationError("Request body must be a JSON object.");
  }

  return body;
}

export function isRecord(value: unknown): value is RequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(body: RequestBody, key: string): string {
  const value = body[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiValidationError(`${key} is required.`);
  }

  return value;
}

export function optionalString(
  body: RequestBody,
  key: string,
): string | undefined {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ApiValidationError(`${key} must be a string.`);
  }

  return value;
}

export function optionalNumber(
  body: RequestBody,
  key: string,
): number | undefined {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiValidationError(`${key} must be a number.`);
  }

  return value;
}

export function optionalBoolean(
  body: RequestBody,
  key: string,
): boolean | undefined {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new ApiValidationError(`${key} must be a boolean.`);
  }

  return value;
}

export function optionalJsonValue(
  body: RequestBody,
  key: string,
): JsonInputRootValue | undefined {
  const value = body[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isJsonInputValue(value)) {
    throw new ApiValidationError(`${key} must be a JSON value.`);
  }

  return value;
}

const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/**
 * Quote/Payment create route'ları için Idempotency-Key header'ını okur.
 * Header yoksa undefined döner (legacy davranış korunur). Header
 * gönderildiyse trim edilir; boş veya 255 karakterden uzunsa 400 fırlatır.
 */
export function optionalIdempotencyKey(request: Request): string | undefined {
  const raw = request.headers.get(IDEMPOTENCY_KEY_HEADER);

  if (raw === null) {
    return undefined;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    throw new ApiValidationError(`${IDEMPOTENCY_KEY_HEADER} must not be empty.`);
  }

  if (trimmed.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new ApiValidationError(
      `${IDEMPOTENCY_KEY_HEADER} must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
    );
  }

  return trimmed;
}

export function requiredSearchParam(
  request: Request,
  key: string,
): string {
  const value = new URL(request.url).searchParams.get(key);

  if (!value || value.trim().length === 0) {
    throw new ApiValidationError(`${key} is required.`);
  }

  return value;
}

export function requiredStringEnum<T extends string>(
  body: RequestBody,
  key: string,
  allowedValues: readonly T[],
): T {
  const value = requiredString(body, key);

  if (!allowedValues.includes(value as T)) {
    throw new ApiValidationError(`${key} is invalid.`);
  }

  return value as T;
}

export function optionalStringEnum<T extends string>(
  body: RequestBody,
  key: string,
  allowedValues: readonly T[],
): T | undefined {
  const value = optionalString(body, key);

  if (value === undefined) {
    return undefined;
  }

  if (!allowedValues.includes(value as T)) {
    throw new ApiValidationError(`${key} is invalid.`);
  }

  return value as T;
}

export type JsonInputValue =
  | string
  | number
  | boolean
  | null
  | JsonInputValue[]
  | { [key: string]: JsonInputValue };

export type JsonInputRootValue = Exclude<JsonInputValue, null>;

function isJsonInputValue(value: unknown): value is JsonInputValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonInputValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonInputValue);
  }

  return false;
}
