import { NextResponse } from "next/server";

const RECOVERABLE_STATUSES = new Set([401, 404, 501, 502, 503, 504]);

interface CoordProxyRequestBody {
  name?: unknown;
  arguments?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CoordProxyRequestBody;

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        endpoint: null,
        reason: "Coord proxy requires a non-empty tool name.",
      },
      { status: 400 },
    );
  }

  const endpoint = getCoordMcpEndpoint();

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
        reason: "COORD_API_KEY is not configured for dashboard mutations.",
      },
      { status: 503 },
    );
  }

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Coord-Key": apiKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${body.name}:${Date.now()}`,
        method: "tools/call",
        params: {
          name: body.name,
          arguments:
            isRecord(body.arguments) ?
              Object.fromEntries(
                Object.entries(body.arguments).filter(([, value]) => value !== undefined),
              )
            : {},
        },
      }),
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

  if (RECOVERABLE_STATUSES.has(response.status)) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason: `Coord API returned ${response.status}.`,
      },
      { status: response.status },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason: `Coord API request failed with status ${response.status}.`,
      },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as unknown;

  if (!isRecord(payload)) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason: "Coord API returned an invalid MCP payload.",
      },
      { status: 502 },
    );
  }

  if (isRecord(payload.error)) {
    return NextResponse.json(
      {
        ok: false,
        endpoint,
        reason:
          typeof payload.error.message === "string"
            ? payload.error.message
            : "Coord MCP call failed.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    endpoint,
    payload: isRecord(payload.result) ? payload.result : null,
  });
}

function getCoordMcpEndpoint() {
  const baseUrl = process.env.COORD_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!baseUrl) {
    return null;
  }

  return new URL("/mcp", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
