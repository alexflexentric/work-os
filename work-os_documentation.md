# Work OS - Documentation

**Version**: 1.3 (2026-04-25)
**Deployment**: https://work-os.fafo-studio.com (Railway)
**Stack**: Next.js 16 App Router, TypeScript 5, Tailwind CSS v4, Prisma 7 + Postgres, NextAuth v5 beta, Anthropic SDK, OpenAI Whisper, Resend, Google Calendar / MS Graph

**Admin**: `alex@fafo-studio.com` — only this email can access `/admin`

---

## Source Projects

| Project | Local Path | Purpose |
|---------|-----------|---------|
| Tina | `/Users/alexparkhomchuk/Desktop/Projects/tina` | Translation feature source |
| Calypso | `/Users/alexparkhomchuk/Desktop/Projects/calypso` | Calendar sync feature source |

---

## Architecture Overview

Work OS is a multi-tenant PWA merging two features:
- **Translation**: AI-powered translation (text + voice via Whisper → Claude)
- **Calendar Sync**: Microsoft or Google as master calendar, with iCal feeds syncing in

Each user brings their own API keys (Anthropic, OpenAI). OAuth app credentials (Google, Microsoft) are app-level, entered once by the admin via the setup wizard and stored in `AppConfig`. All user data is strictly scoped by `userId`.

### Key Architectural Decisions

- **Setup wizard**: On first launch, if no OAuth credentials exist in `AppConfig`, all routes redirect to `/setup`. The wizard collects Google and/or Microsoft app credentials with in-UI instructions. Once saved, `/setup` is locked to the admin only.
- **Dynamic NextAuth providers**: NextAuth reads OAuth credentials from `AppConfig` at request time, not from env vars. Supports Google, Microsoft, or both simultaneously depending on what is configured.
- **Master calendar = sign-in provider**: The OAuth provider used at sign-up (Google or Microsoft) is automatically the master calendar. No separate calendar OAuth step.
- **Per-user API keys**: Users pay their own LLM/Whisper bills. Keys stored in `UserSettings`.
- **Admin approval gate**: `User.isApproved` flag; unapproved users are redirected to `/approval-pending`. Approval triggers a Welcome email via Resend.
- **Worker service**: Separate Railway worker syncs iCal feeds into the master calendar every 15 min for approved users.
- **PWA**: Custom `manifest.json` + `sw.js` with cache-first static, network-first API strategy.

---

## Environment Variables

Only infrastructure-level vars live in Railway. All OAuth credentials are stored in the DB via `/setup`.

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Railway Postgres (private endpoint) |
| `NEXTAUTH_URL` | `https://work-os.fafo-studio.com` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend dashboard |
| `SYNC_INTERVAL_MINUTES` | Optional, default 15 |
| `USER_TIMEZONE` | Optional, default UTC |
| `PUBLIC_API_SECRET` | Secret for `/api/public/*` endpoints |

---

## Database Schema

Key models:

| Model | Purpose |
|-------|---------|
| `AppConfig` | Singleton row. App-level OAuth credentials (Google, Microsoft). Read by NextAuth at runtime. |
| `User` | NextAuth user + `isApproved` flag |
| `Account` / `Session` / `VerificationToken` | NextAuth standard models. Provider `'google'` or `'microsoft'` determines master calendar. |
| `UserSettings` | Per-user API keys, sync interval, `masterCalendarProvider`, `calendarId` |
| `CalendarConnection` | iCal connections (sourceType `'ical'`). |
| `EventMapping` | Synced event records |
| `Tone` | User-defined translation tones |
| `Format` | User-defined translation formats |

### AppConfig fields

| Field | Notes |
|-------|-------|
| `googleClientId` | Google OAuth app client ID |
| `googleClientSecret` | Google OAuth app client secret |
| `microsoftClientId` | Microsoft Entra app client ID |
| `microsoftClientSecret` | Microsoft Entra app client secret |
| `microsoftTenantId` | Microsoft Entra tenant ID |

At least one provider (Google or Microsoft) must be configured for sign-in to work.

### UserSettings fields

| Field | Notes |
|-------|-------|
| `anthropicApiKey` | For Claude translation |
| `openaiApiKey` | For Whisper transcription |
| `masterCalendarProvider` | `'google'` or `'microsoft'` — set from sign-in provider |
| `calendarId` | Selected calendar ID within the master account |
| `syncInterval` | Minutes between iCal sync runs (default 15) |

---

## Setup Wizard (`/setup`)

- Accessible without authentication
- Redirects away if credentials already exist and current user is not admin
- Multi-step: (1) Google config, (2) Microsoft config, (3) Done
- Each step shows in-UI instructions for creating the OAuth app, with redirect URIs pre-filled for the current domain
- Saves to `AppConfig` (single row, upserted)
- After setup, NextAuth is re-initialised with the new providers on the next request

### OAuth redirect URIs to register

| Provider | Redirect URI |
|----------|-------------|
| Google | `https://work-os.fafo-studio.com/api/auth/callback/google` |
| Microsoft | `https://work-os.fafo-studio.com/api/auth/callback/microsoft-entra-id` |
| Google (dev) | `http://localhost:3000/api/auth/callback/google` |
| Microsoft (dev) | `http://localhost:3000/api/auth/callback/microsoft-entra-id` |

---

## Authentication

- Providers: **Google OAuth** and/or **Microsoft Entra ID** — whichever is configured in `AppConfig`
- Scopes (Google): `openid email profile https://www.googleapis.com/auth/calendar`
- Scopes (Microsoft): `openid email profile offline_access Calendars.ReadWrite`
- Middleware: unauthenticated + no AppConfig → `/setup`; unauthenticated + AppConfig exists → `/`; authenticated + unapproved → `/approval-pending`
- `createUser` event triggers `sendApprovalPendingEmail()`

---

## Features

### Translation (`/translation`)
- Text input or mic recording → OpenAI Whisper transcription → Claude translation
- User selects target language, format (dropdown, DB-driven), and tone (dropdown, DB-driven)
- Clear button on text area
- Output supports copy and text-to-speech
- API routes: `POST /api/transcribe`, `POST /api/translate`

### Calendar Sync
- Master calendar: Google or Microsoft (determined by sign-in provider)
- iCal feeds can be connected and synced into the master calendar
- Cron worker syncs every 15 min for all approved users
- Public availability API: `GET /api/public/availability` — reads from master calendar
- Core logic: `lib/google.ts`, `lib/microsoft.ts`, `lib/sync-engine.ts`, `lib/ical.ts`, `lib/freebusy.ts`

### Settings (`/settings`)

Sidebar navigation with three groups:

**General**
- API Keys: Anthropic, OpenAI

**Translation**
- Formats: user-defined formats (create / edit / reorder)
- Tones: user-defined tones (create / edit / reorder)

**Calendar**
- Master account info (read-only: provider + email from session)
- Primary calendar: `<select>` populated from `GET /api/calendar/calendars`; auto-selects primary; falls back to text input if API unavailable
- Sync interval (minutes)
- iCal connections: list with Active/Paused toggle and Delete; Add iCal feed form (name + URL)

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/setup` | GET / POST | Read / write AppConfig (admin only after initial setup) |
| `/api/settings` | GET / POST | Read / write UserSettings |
| `/api/tones` | GET / POST | List / create tones |
| `/api/tones/[id]` | PATCH / DELETE | Edit / delete tone |
| `/api/formats` | GET / POST | List / create formats |
| `/api/formats/[id]` | PATCH / DELETE | Edit / delete format |
| `/api/translate` | POST | Claude translation |
| `/api/transcribe` | POST | Whisper transcription |
| `/api/calendar/calendars` | GET | List calendars from master account |
| `/api/calendar/connections` | GET / POST | List / create iCal connections |
| `/api/calendar/connections/[id]` | PATCH / DELETE | Toggle active / delete iCal connection |
| `/api/public/availability` | GET | Public free/busy (reads master calendar) |

---

## Email (Resend)

| Template | Trigger |
|----------|---------|
| `ApprovalPending` | On new user signup |
| `Welcome` | On admin approval |

Sender: `Work OS <support@fafo-studio.com>`

---

## Deployment (Railway)

- Build command (via `package.json`): `prisma generate && next build`
- Start command (via `railway.json`): `prisma migrate deploy && npm start`
- Two services: `web` (Next.js) and `worker` (`npx tsx src/workers/sync-worker.ts`)
- Custom domain: `work-os.fafo-studio.com`
