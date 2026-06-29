import { NextRequest, NextResponse } from "next/server";

import { services } from "@/lib/server/services";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const normalizedMessage = services.integrations.gmail.normalizeIncomingPayload(payload);
    const result = await services.pipeline.processMessage(normalizedMessage);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}
