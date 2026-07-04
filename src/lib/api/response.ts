export type ApiSuccessResponse<T> = {
  ok: true;
  data: T;
};

export type ApiErrorResponse = {
  ok: false;
  error: {
    message: string;
  };
};

export function ok<T>(data: T, status = 200): Response {
  return Response.json(
    {
      ok: true,
      data,
    } satisfies ApiSuccessResponse<T>,
    {
      status,
    },
  );
}

export function fail(message: string, status = 500): Response {
  return Response.json(
    {
      ok: false,
      error: {
        message,
      },
    } satisfies ApiErrorResponse,
    {
      status,
    },
  );
}

