export type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: { message: string }; status?: number };

export async function executivePresenceApiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return response.json() as Promise<ApiResponse<T>>;
}
