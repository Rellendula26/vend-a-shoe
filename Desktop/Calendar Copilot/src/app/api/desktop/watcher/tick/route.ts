import { NextRequest, NextResponse } from "next/server";

import { DesktopBackgroundWatcherService } from "@/lib/desktop/background-watcher";

export const runtime = "nodejs";

const desktopWatcherService = new DesktopBackgroundWatcherService();

function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.DESKTOP_WATCHER_TOKEN ?? "";
  if (!expectedToken) {
    return true;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return false;
  }

  const supplied = authHeader.slice("Bearer ".length).trim();
  return supplied === expectedToken;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized desktop watcher request." }, { status: 401 });
  }

  try {
    const result = await desktopWatcherService.tick();
    return NextResponse.json({
      status: "ok",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown watcher error",
      },
      { status: 500 },
    );
  }
}
