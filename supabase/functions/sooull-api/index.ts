import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://sooull.vercel.app",
  "https://soull-admin-console.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
]);

const services = new Set([
  "admin-overview",
  "admin-management",
  "persona-chat",
  "delete-account",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://sooull.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function json(status: number, payload: Record<string, unknown>, origin: string | null, requestId: string) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "X-SOOULL-Request-Id": requestId,
    },
  });
}

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json(405, { error: "Only POST requests are supported." }, origin, requestId);
  }
  if (origin && !allowedOrigins.has(origin)) {
    return json(403, { error: "This application origin is not allowed." }, origin, requestId);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, { error: "A valid signed-in session is required." }, origin, requestId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const apiKey = request.headers.get("apikey")
    ?? Deno.env.get("SUPABASE_ANON_KEY")
    ?? "";
  if (!supabaseUrl || !apiKey) {
    return json(503, { error: "The SOOULL server is not configured." }, origin, requestId);
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > 1_048_576) {
    return json(413, { error: "Request payload exceeds the 1 MB limit." }, origin, requestId);
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_048_576) {
      return json(413, { error: "Request payload exceeds the 1 MB limit." }, origin, requestId);
    }
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return json(400, { error: "Request body must be valid JSON." }, origin, requestId);
  }

  const service = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).service
    : null;
  if (typeof service !== "string" || !services.has(service)) {
    return json(404, { error: "The requested SOOULL service is not available." }, origin, requestId);
  }

  const body = { ...(payload as Record<string, unknown>) };
  delete body.service;

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${service}`, {
      method: "POST",
      headers: {
        "Authorization": authorization,
        "apikey": apiKey,
        "Content-Type": "application/json",
        ...(origin ? { "Origin": origin } : {}),
        ...(request.headers.get("x-client-info")
          ? { "x-client-info": request.headers.get("x-client-info")! }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });

    const responseBody = await upstream.arrayBuffer();
    const headers = new Headers(corsHeaders(origin));
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
    headers.set("X-SOOULL-Request-Id", requestId);
    return new Response(responseBody, { status: upstream.status, headers });
  } catch (error) {
    console.error("SOOULL backend dispatch failed", {
      requestId,
      service,
      error: error instanceof Error ? error.message : "unknown",
    });
    return json(502, { error: "The requested SOOULL service is temporarily unavailable.", requestId }, origin, requestId);
  }
});
