export async function POST(): Promise<Response> {
  return Response.json(
    {
      ok: false,
      code: "EXECUTIVE_NOT_WIRED"
    },
    {
      status: 501
    }
  );
}
