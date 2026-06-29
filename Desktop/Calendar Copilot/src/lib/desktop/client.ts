import type { CandidateEventRecord, DesktopState, GoogleOAuthConfigInput } from "@/lib/desktop/contracts";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const isBrowser = typeof window !== "undefined";
export const isDesktopRuntime = isBrowser && typeof window.__TAURI_INTERNALS__ !== "undefined";

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(command, args);
}

export async function fetchDesktopState(): Promise<DesktopState> {
  return invoke<DesktopState>("get_desktop_state");
}

export async function setWatcherEnabled(enabled: boolean): Promise<void> {
  await invoke("set_watcher_enabled", { enabled });
}

export async function setPollingIntervalSeconds(seconds: number): Promise<void> {
  await invoke("set_polling_interval_seconds", { seconds });
}

export async function runWatcherNow(): Promise<void> {
  await invoke("run_watcher_once");
}

export async function saveGoogleOAuthConfig(config: GoogleOAuthConfigInput): Promise<void> {
  await invoke("save_google_oauth_config", { config });
}

export async function generateGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
): Promise<{ url: string }> {
  return invoke<{ url: string }>("generate_google_auth_url", { clientId, redirectUri });
}

export async function exchangeGoogleAuthCode(payload: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ refreshTokenStored: boolean }> {
  return invoke("exchange_google_auth_code", payload);
}

export async function ignoreCandidate(candidateId: string): Promise<void> {
  await invoke("ignore_candidate", { candidateId });
}

export async function createCalendarEventFromCandidate(payload: {
  candidateId: string;
  title: string;
  startTime: string;
  endTime?: string;
  timezone?: string;
  location?: string;
  attendees?: string[];
  description?: string;
}): Promise<{ calendarEventId: string }> {
  return invoke("create_calendar_event_from_candidate", payload);
}

export function toMessageSnippet(candidate: CandidateEventRecord): string {
  return candidate.message.body.slice(0, 220);
}
