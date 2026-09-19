/**
 * The exact redirect_uri Nylas must have registered for this application
 * (Hosted Authentication requires the value sent to /v3/connect/auth and
 * the value sent to /v3/connect/token to match byte-for-byte). Derived
 * from the incoming request's own origin so it is correct in every
 * environment (localhost during development, the real domain in
 * production) without a separate env var to keep in sync.
 */
export function nylasCallbackUrl(request: Request): string {
  return new URL("/api/integrations/nylas/callback", request.url).toString();
}
