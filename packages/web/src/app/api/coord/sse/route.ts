import { NextResponse } from "next/server";

const RECOVERABLE_STATUSES = new Set([401, 404, 501, 502, 503, 504]);

export async function GET(request: Request) {
  const endpoint = getCoordSseEndpoint(request.url);

  if (!endpoint) {
    return NextResponse.json(
      {
        ok: false,
        endpoint: null,
        reason: "Coord API URL is not configured.",
      },
      { status: 503 },
    );
  }

  const apiKey = process.env.COORD_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason: "COORD_API_KEY is not configured for dashboard SSE.",
      },
      { status: 503 },
    );
  }

  let upstream: Response;

  try {
    upstream = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "text/event-stream",
        "X-Coord-Key": apiKey,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason: error instanceof Error ? error.message : "Failed to contact coord API.",
      },
      { status: 503 },
    );
  }

  if (RECOVERABLE_STATUSES.has(upstream.status)) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason: `Coord API returned ${upstream.status}.`,
      },
      { status: upstream.status },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason: `Coord API SSE request failed with status ${upstream.status}.`,
      },
      { status: upstream.status || 502 },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "text/event-stream");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("Connection", "keep-alive");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

function getCoordSseEndpoint(requestUrl: string) {
  const baseUrl = process.env.COORD_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!baseUrl) {
    return null;
  }

  const request = new URL(requestUrl);
  const endpoint = new URL("/sse", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

  const stream = request.searchParams.get("stream");

  if (stream) {
    endpoint.searchParams.set("stream", stream);
  }

  return endpoint.toString();
}
