export function corsHeaders(): Record<string, string> {
  const origin = process.env.BOOKING_PAGE_URL ?? "https://flexentric.com";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-booking-token",
  };
}

// Returns a 403 Response if the request fails auth checks, null if it passes.
export function guardPublicApi(request: Request): Response | null {
  const token = request.headers.get("x-booking-token");
  if (!token || token !== process.env.BOOKING_PAGE_SECRET) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders() });
  }

  const origin = request.headers.get("origin");
  const allowed = process.env.BOOKING_PAGE_URL ?? "https://flexentric.com";
  if (origin && origin !== allowed) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders() });
  }

  return null;
}
