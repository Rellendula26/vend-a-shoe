"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CandidateEventRecord, DesktopState } from "@/lib/desktop/contracts";
import {
  createCalendarEventFromCandidate,
  exchangeGoogleAuthCode,
  fetchDesktopState,
  generateGoogleAuthUrl,
  ignoreCandidate,
  isDesktopRuntime,
  runWatcherNow,
  saveGoogleOAuthConfig,
  setPollingIntervalSeconds,
  setWatcherEnabled,
  toMessageSnippet,
} from "@/lib/desktop/client";

interface Suggestion {
  id: string;
  status: "pending" | "approved" | "ignored" | "auto_approved";
  createdAt: string;
  message: {
    platform: string;
    sender: string;
    text: string;
  };
  extractedEvent: {
    title: string;
    startIso: string;
    endIso: string;
    timezone: string;
    location?: string;
    confidence: number;
  };
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
}

type CandidateEditState = Record<
  string,
  {
    title: string;
    startTime: string;
    endTime: string;
    timezone: string;
    location: string;
    attendees: string;
    description: string;
  }
>;

export default function HomePage(): React.ReactElement {
  const [desktopState, setDesktopState] = useState<DesktopState | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<string | null>(null);
  const [edits, setEdits] = useState<CandidateEditState>({});
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthRedirectUri, setOauthRedirectUri] = useState("http://127.0.0.1:8976/oauth/callback");
  const [oauthRefreshToken, setOauthRefreshToken] = useState("");
  const [oauthCode, setOauthCode] = useState("");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState("90");
  const [desktopError, setDesktopError] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    setDesktopError(null);
    if (isDesktopRuntime) {
      try {
        const data = await fetchDesktopState();
        setDesktopState(data);
        setPollingInterval(String(data.status.pollingIntervalSeconds));
      } catch (error) {
        setDesktopError(error instanceof Error ? error.message : "Failed to read desktop state.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const response = await fetch("/api/suggestions", { cache: "no-store" });
    const data = (await response.json()) as SuggestionsResponse;
    setSuggestions(data.suggestions);
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadSuggestions();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [loadSuggestions]);

  const sortedSuggestions = useMemo(() => {
    return [...suggestions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [suggestions]);

  const sortedDesktopCandidates = useMemo(() => {
    return [...(desktopState?.candidates ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [desktopState]);

  async function resolveSuggestion(id: string, action: "approve" | "ignore"): Promise<void> {
    setActionPending(id);
    setLoading(true);
    await fetch(`/api/suggestions/${id}/${action}`, { method: "POST" });
    setActionPending(null);
    await loadSuggestions();
  }

  async function onSaveOAuthConfig(): Promise<void> {
    await saveGoogleOAuthConfig({
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      redirectUri: oauthRedirectUri,
      refreshToken: oauthRefreshToken || undefined,
      calendarId: "primary",
    });
    await loadSuggestions();
  }

  async function onGenerateAuthUrl(): Promise<void> {
    const result = await generateGoogleAuthUrl(oauthClientId, oauthRedirectUri);
    setAuthUrl(result.url);
  }

  async function onExchangeCode(): Promise<void> {
    await exchangeGoogleAuthCode({
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      redirectUri: oauthRedirectUri,
      code: oauthCode,
    });
    setOauthCode("");
    await loadSuggestions();
  }

  async function onToggleWatcher(enabled: boolean): Promise<void> {
    await setWatcherEnabled(enabled);
    await loadSuggestions();
  }

  async function onSavePollingInterval(): Promise<void> {
    const parsed = Number(pollingInterval);
    if (Number.isNaN(parsed)) return;
    await setPollingIntervalSeconds(parsed);
    await loadSuggestions();
  }

  async function onIgnoreDesktopCandidate(candidateId: string): Promise<void> {
    setActionPending(candidateId);
    await ignoreCandidate(candidateId);
    setActionPending(null);
    await loadSuggestions();
  }

  async function onCreateDesktopEvent(candidate: CandidateEventRecord): Promise<void> {
    setActionPending(candidate.id);
    const editable = edits[candidate.id];
    await createCalendarEventFromCandidate({
      candidateId: candidate.id,
      title: editable?.title ?? candidate.extractedEvent.title,
      startTime: editable?.startTime ?? candidate.extractedEvent.startTime,
      endTime: editable?.endTime || candidate.extractedEvent.endTime,
      timezone: editable?.timezone || candidate.extractedEvent.timezone,
      location: editable?.location || candidate.extractedEvent.location,
      attendees:
        editable?.attendees
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean) ?? candidate.extractedEvent.attendees,
      description: editable?.description || candidate.extractedEvent.description,
    });
    setActionPending(null);
    setActiveEditor(null);
    await loadSuggestions();
  }

  function startEditing(candidate: CandidateEventRecord): void {
    setActiveEditor(candidate.id);
    setEdits((prev) => ({
      ...prev,
      [candidate.id]: {
        title: candidate.extractedEvent.title,
        startTime: candidate.extractedEvent.startTime,
        endTime: candidate.extractedEvent.endTime ?? "",
        timezone: candidate.extractedEvent.timezone ?? "UTC",
        location: candidate.extractedEvent.location ?? "",
        attendees: (candidate.extractedEvent.attendees ?? []).join(", "),
        description: candidate.extractedEvent.description ?? "",
      },
    }));
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-10">
        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-sky-200/80">Calendar Copilot</p>
        <h1 className="text-4xl font-semibold text-white">AI scheduling inbox</h1>
        <p className="mt-4 max-w-2xl text-sm text-slate-300">
          Incoming Gmail messages are normalized, scored, deduped, and queued for explicit calendar
          approval.
        </p>
      </header>

      {isDesktopRuntime && desktopState ? (
        <section className="mb-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-sky-100/80">Desktop watcher</p>
              <p className="text-sm text-slate-300">
                {desktopState.status.connected ? "Connected" : "Not connected"} - last checked:{" "}
                {desktopState.status.lastChecked
                  ? new Date(desktopState.status.lastChecked).toLocaleString()
                  : "Never"}
              </p>
              <p className="text-sm text-slate-400">
                Candidate events detected: {desktopState.status.detectedCount}
              </p>
            </div>
            <button
              onClick={() => onToggleWatcher(!desktopState.status.watcherEnabled)}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
            >
              Watcher: {desktopState.status.watcherEnabled ? "On" : "Off"}
            </button>
            <button
              onClick={() => runWatcherNow().then(loadSuggestions)}
              className="rounded-lg border border-sky-300/30 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-400/10"
            >
              Check now
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-300">
              Polling interval (seconds)
              <input
                value={pollingInterval}
                onChange={(event) => setPollingInterval(event.target.value)}
                className="mt-1 w-36 rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              onClick={onSavePollingInterval}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
            >
              Save interval
            </button>
          </div>

          <details className="rounded-xl border border-white/10 bg-black/15 p-4">
            <summary className="cursor-pointer text-sm text-slate-200">Google OAuth setup</summary>
            <div className="mt-3 grid gap-3">
              <input
                placeholder="Google OAuth Client ID"
                value={oauthClientId}
                onChange={(event) => setOauthClientId(event.target.value)}
                className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <input
                placeholder="Google OAuth Client Secret"
                value={oauthClientSecret}
                onChange={(event) => setOauthClientSecret(event.target.value)}
                className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <input
                placeholder="Redirect URI"
                value={oauthRedirectUri}
                onChange={(event) => setOauthRedirectUri(event.target.value)}
                className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <input
                placeholder="Refresh token (optional if exchanging auth code)"
                value={oauthRefreshToken}
                onChange={(event) => setOauthRefreshToken(event.target.value)}
                className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onSaveOAuthConfig}
                  className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300"
                >
                  Save OAuth config
                </button>
                <button
                  onClick={onGenerateAuthUrl}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
                >
                  Generate consent URL
                </button>
              </div>
              {authUrl ? (
                <a className="break-all text-xs text-sky-300 underline" href={authUrl} target="_blank">
                  {authUrl}
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <input
                  placeholder="Auth code from redirect"
                  value={oauthCode}
                  onChange={(event) => setOauthCode(event.target.value)}
                  className="min-w-80 flex-1 rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <button
                  onClick={onExchangeCode}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
                >
                  Exchange code
                </button>
              </div>
            </div>
          </details>
        </section>
      ) : null}

      {desktopError ? (
        <div className="mb-4 rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-100">
          {desktopError}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-slate-300">
          Loading suggestions...
        </div>
      ) : isDesktopRuntime ? (
        sortedDesktopCandidates.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-slate-300">
            No candidate events yet. Enable watcher and connect Google OAuth.
          </div>
        ) : (
          <section className="grid gap-4">
            {sortedDesktopCandidates.map((candidate) => {
              const start = new Date(candidate.extractedEvent.startTime).toLocaleString();
              const editable = edits[candidate.id];
              return (
                <article
                  key={candidate.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-sky-950/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-sky-200/80">
                        Candidate approval required
                      </p>
                      <h2 className="mt-2 text-2xl font-medium text-white">{candidate.extractedEvent.title}</h2>
                      <p className="mt-2 text-sm text-slate-300">{start}</p>
                      <p className="mt-1 text-sm text-slate-400">Sender: {candidate.message.sender}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Confidence: {Math.round(candidate.extractedEvent.confidence * 100)}%
                      </p>
                    </div>
                    <p className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                      {candidate.message.source}
                    </p>
                  </div>

                  <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                    {toMessageSnippet(candidate)}
                  </p>

                  {activeEditor === candidate.id ? (
                    <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-4">
                      <input
                        value={editable?.title ?? ""}
                        onChange={(event) =>
                          setEdits((prev) => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], title: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <input
                        value={editable?.startTime ?? ""}
                        onChange={(event) =>
                          setEdits((prev) => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], startTime: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <input
                        value={editable?.endTime ?? ""}
                        onChange={(event) =>
                          setEdits((prev) => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], endTime: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <input
                        value={editable?.timezone ?? ""}
                        onChange={(event) =>
                          setEdits((prev) => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], timezone: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <input
                        value={editable?.location ?? ""}
                        onChange={(event) =>
                          setEdits((prev) => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], location: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <input
                        value={editable?.attendees ?? ""}
                        onChange={(event) =>
                          setEdits((prev) => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], attendees: event.target.value },
                          }))
                        }
                        className="rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <textarea
                        value={editable?.description ?? ""}
                        onChange={(event) =>
                          setEdits((prev) => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], description: event.target.value },
                          }))
                        }
                        className="min-h-24 rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                    </div>
                  ) : null}

                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => onCreateDesktopEvent(candidate)}
                      disabled={actionPending === candidate.id}
                      className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300 disabled:opacity-60"
                    >
                      Create Event
                    </button>
                    <button
                      onClick={() => (activeEditor === candidate.id ? setActiveEditor(null) : startEditing(candidate))}
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                      {activeEditor === candidate.id ? "Close Edit" : "Edit"}
                    </button>
                    <button
                      onClick={() => onIgnoreDesktopCandidate(candidate.id)}
                      disabled={actionPending === candidate.id}
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-60"
                    >
                      Ignore
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )
      ) : sortedSuggestions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-slate-300">
          No pending suggestions yet. Send a Gmail webhook payload to `POST /api/gmail/webhook`.
        </div>
      ) : (
        <section className="grid gap-4">
          {sortedSuggestions.map((suggestion) => {
            const start = new Date(suggestion.extractedEvent.startIso).toLocaleString();
            return (
              <article
                key={suggestion.id}
                className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-sky-950/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-sky-200/80">
                      Potential calendar event detected
                    </p>
                    <h2 className="mt-2 text-2xl font-medium text-white">{suggestion.extractedEvent.title}</h2>
                    <p className="mt-2 text-sm text-slate-300">{start}</p>
                    {suggestion.extractedEvent.location ? (
                      <p className="mt-1 text-sm text-slate-400">
                        Location: {suggestion.extractedEvent.location}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      Confidence: {Math.round(suggestion.extractedEvent.confidence * 100)}%
                    </p>
                  </div>
                  <p className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                    {suggestion.message.platform}
                  </p>
                </div>

                <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                  {suggestion.message.text.slice(0, 220)}
                </p>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => resolveSuggestion(suggestion.id, "approve")}
                    disabled={actionPending === suggestion.id}
                    className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300 disabled:opacity-60"
                  >
                    Create event
                  </button>
                  <button
                    onClick={() => resolveSuggestion(suggestion.id, "ignore")}
                    disabled={actionPending === suggestion.id}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-60"
                  >
                    Ignore
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
