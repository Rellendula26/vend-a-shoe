import { NextRequest, NextResponse } from "next/server";

import { services } from "@/lib/server/services";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const suggestion = await services.store.getById(id);

  if (!suggestion) {
    return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  }

  await services.store.updateStatus(id, "ignored");
  return NextResponse.json({ ok: true });
}
