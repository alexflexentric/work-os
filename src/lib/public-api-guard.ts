export function corsHeaders(): Record<string, string> {
  const origin = process.env.BOOKING_PAGE_URL ?? "https://flexentric.com";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-booking-token",
  };
}

// Returns a 403 Response if the origin check fails, null if it passes.
// x-booking-token is accepted but not required (Lovable sends it, we ignore it).
export function guardPublicApi(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const allowed = process.env.BOOKING_PAGE_URL ?? "https://flexentric.com";
  if (origin && origin !== allowed) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders() });
  }
  return null;
}
