import { NextResponse } from "next/server";

import { services } from "@/lib/server/services";

export async function GET(): Promise<NextResponse> {
  const suggestions = await services.store.listPending(50);
  return NextResponse.json({ suggestions });
}
