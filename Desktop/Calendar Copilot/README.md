# Calendar Copilot (MVP Foundation)

Calendar Copilot is an AI scheduling layer that turns conversational scheduling signals into draft calendar events with one-click approval.

This repository contains a production-oriented MVP foundation focused on:

- Gmail ingestion (webhook contract)
- AI event extraction (OpenAI Responses API)
- Duplicate detection
- User approval queue
- Google Calendar event creation

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase (optional persistent store)
- Google Calendar API
- OpenAI Responses API

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy env vars:

```bash
cp .env.example .env.local
```

3. Run:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Test Gmail Ingestion

Send a sample webhook payload:

```bash
curl -X POST http://localhost:3000/api/gmail/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id":"msg_001",
    "threadId":"thr_001",
    "from":"alex@example.com",
    "to":["you@example.com"],
    "subject":"Coffee Thursday?",
    "body":"Hey! Want to grab coffee Thursday around 3 at Sweetwaters?",
    "receivedAt":"2026-06-29T04:00:00.000Z"
  }'
```

Refresh the UI to see the pending suggestion and approve/ignore it.

## Supabase Schema (Optional)

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, suggestions are persisted in Supabase.

```sql
create table if not exists public.event_suggestions (
  id text primary key,
  message jsonb not null,
  extracted_event jsonb not null,
  status text not null check (status in ('pending','approved','ignored','auto_approved')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  calendar_event_id text
);

alter table public.event_suggestions enable row level security;
```

Then add policies appropriate for your deployment model (service role on backend only vs end-user reads).

## Architecture Notes

The core architecture is intentionally modular:

- `IntegrationProvider`: normalize source-specific payloads into a common message shape
- `EventExtractor`: AI extraction contract for scheduling data
- `SuggestionsStore`: persistence abstraction with in-memory + Supabase implementations
- `CalendarProvider`: event creation abstraction (Google now, others later)
- `MessagePipeline`: orchestration for extraction -> confidence gating -> duplicate detection -> queue

This makes Slack/Discord/Teams support additive rather than requiring rework of Gmail logic.
