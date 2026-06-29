# Calendar Copilot

Calendar Copilot turns scheduling language in messages into event candidates that always require user approval before creation.

## Stack

- Next.js App Router (web UI + API routes)
- Tauri v2 (desktop shell, macOS-first)
- Rust background watcher (Gmail polling + local persistence)
- Google Gmail + Google Calendar APIs

## Web Development

1. Install dependencies:

```bash
npm install
```

2. Configure web env vars:

```bash
cp .env.example .env.local
```

3. Run web app:

```bash
npm run dev
```

## Desktop Development (Tauri)

Desktop runtime uses the same frontend but runs watcher/calendar actions through Tauri commands.

```bash
npm run dev:desktop
```

## Desktop Build (macOS-first)

Build desktop frontend payload + Tauri app:

```bash
npm run build:desktop
```

Build a macOS `.dmg` bundle:

```bash
npm run package:mac
```

Note: local machine must have Rust toolchain + Tauri build prerequisites installed.

## Key Desktop Features

- Background watcher toggle (On/Off)
- Configurable Gmail polling interval
- Status panel: connected state, last checked timestamp, detected count
- Candidate approval queue with `Create Event`, `Edit`, and `Ignore`
- Duplicate prevention by `sourceMessageId`
- Local persisted watcher state, processed message IDs, candidates, created-event map
- Secure refresh token storage via OS keychain (via Rust `keyring`)

## OAuth Scopes Used

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.events`

## Current Stubs

- Slack integration: not implemented yet
- Discord integration: not implemented yet

See `INSTALLABLE_MVP.md` for full installable MVP status and remaining production steps.
