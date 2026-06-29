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

  if (suggestion.status !== "pending") {
    return NextResponse.json({ error: "Suggestion already resolved" }, { status: 409 });
  }

  const calendarEventId = await services.calendar.createEvent(suggestion);
  await services.store.updateStatus(id, "approved", calendarEventId);

  return NextResponse.json({ ok: true, calendarEventId });
}
