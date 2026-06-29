# INSTALLABLE_MVP

## What Works (Implemented)

- Tauri desktop shell configured as **Calendar Copilot** (`src-tauri/tauri.conf.json`)
- Desktop/web shared UI with runtime adapter:
  - Web mode continues to use existing Next API routes
  - Desktop mode uses Tauri commands via `@tauri-apps/api`
- Native-ish background watcher loop in Rust:
  - Polls Gmail at configurable interval
  - Tracks `lastChecked`
  - Tracks and dedupes processed Gmail message IDs
  - Extracts candidate events with rules (today/tomorrow/next weekday/explicit date/time parsing)
- Normalized source message + extracted event objects (exact requested shape in TS contracts)
- Candidate approval queue UI:
  - `Create Event`
  - `Edit` (title, times, timezone, location, attendees, description)
  - `Ignore`
- Google Calendar event creation requires explicit approval from queue action
- Duplicate prevention:
  - Never creates second event from same `sourceMessageId`
  - Persists created event mapping locally
- OAuth readiness:
  - Save OAuth client config from UI
  - Generate consent URL for required scopes
  - Exchange auth code and securely persist refresh token in OS keychain
- Local desktop persistence:
  - watcher enabled/disabled
  - polling interval
  - processed message IDs
  - candidate events
  - created-event mapping
  - detected count
  - last checked timestamp

## What Is Stubbed

- Slack integration class present but throws `"not implemented yet"`
- Discord integration class present but throws `"not implemented yet"`
- LLM extraction replacement is intentionally not wired yet; rules extractor is the default first implementation

## Local Run

### Web

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Desktop

```bash
npm run dev:desktop
```

## macOS Build

```bash
npm run build:desktop
npm run package:mac
```

If prerequisites are missing, install:
- Rust + Cargo
- Xcode command line tools
- Tauri system dependencies

## Remaining Signing / Notarization

Scaffolded but **not fully implemented** in this MVP:

- Apple Developer signing identity wiring
- Notarization credentials + notarization upload workflow
- Stapling + validation automation in CI

## Remaining Auto-Update

Not implemented yet:
- Signed update manifest hosting
- Tauri updater endpoint + channels
- Rollout strategy (staged, rollback)

## Remaining Slack / Discord

Not implemented yet:
- API ingestion adapters
- auth/token management
- source-specific message normalization for those platforms
- channel/thread-specific dedupe logic

## Notes

- This MVP intentionally prioritizes **installable concept proof** over release hardening.
- Existing web app behavior is preserved; desktop functionality is additive.
