"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function HomePage(): React.ReactElement {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    const response = await fetch("/api/suggestions", { cache: "no-store" });
    const data = (await response.json()) as SuggestionsResponse;
    setSuggestions(data.suggestions);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      const response = await fetch("/api/suggestions", { cache: "no-store" });
      const data = (await response.json()) as SuggestionsResponse;
      if (cancelled) return;
      setSuggestions(data.suggestions);
      setLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedSuggestions = useMemo(() => {
    return [...suggestions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [suggestions]);

  async function resolveSuggestion(id: string, action: "approve" | "ignore"): Promise<void> {
    setActionPending(id);
    setLoading(true);
    await fetch(`/api/suggestions/${id}/${action}`, { method: "POST" });
    setActionPending(null);
    await loadSuggestions();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-10">
        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-sky-200/80">Calendar Copilot</p>
        <h1 className="text-4xl font-semibold text-white">AI scheduling inbox</h1>
        <p className="mt-4 max-w-2xl text-sm text-slate-300">
          Incoming Gmail messages are normalized, scored by AI, deduped, and queued for one-click
          calendar approval.
        </p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-slate-300">
          Loading suggestions...
        </div>
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
                    <h2 className="mt-2 text-2xl font-medium text-white">
                      {suggestion.extractedEvent.title}
                    </h2>
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
