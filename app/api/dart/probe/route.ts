import { NextResponse, type NextRequest } from "next/server";

import { callDartEndpoint, DartClientError } from "@/lib/dart/client";
import { isDartEndpoint, validateEndpointParams } from "@/lib/dart/endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get("endpoint");

  if (!isDartEndpoint(endpoint)) {
    return NextResponse.json(
      { error: `허용되지 않은 endpoint입니다: ${endpoint ?? "(없음)"}` },
      { status: 400 },
    );
  }

  const rawParams: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key === "endpoint") continue;
    rawParams[key] = value;
  }

  const validation = validateEndpointParams(endpoint, rawParams);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const envelope = await callDartEndpoint(endpoint, validation.params);
    return NextResponse.json(envelope);
  } catch (err) {
    const message = err instanceof DartClientError ? err.message : "DART 요청 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
