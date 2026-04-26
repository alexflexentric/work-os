# Work OS - Documentation

**Version**: 1.5 (2026-04-25)
**Deployment**: https://work-os.flexentric.com (Railway)
**Stack**: Next.js 16 App Router, TypeScript 5, Tailwind CSS v4, Prisma 7 + Postgres, NextAuth v5 beta, Anthropic SDK, OpenAI Whisper, Resend, Google Calendar / MS Graph

**Admin**: `alex@flexentric.com` — only this email can access `/admin`

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
- **Middleware edge redirect**: Authenticated users (session cookie present) hitting `/` are redirected to `/home` at the edge — the server-rendered sign-in page is never reached for logged-in users.
- **Per-user API keys**: Users pay their own LLM/Whisper bills. Keys stored in `UserSettings`.
- **Admin approval gate**: `User.isApproved` flag; unapproved users are redirected to `/approval-pending`. Approval triggers a Welcome email via Resend.
- **Worker service**: `sync-worker.ts` exists (node-cron) but is **not running on Railway**. Instead, `POST /api/calendar/sync` accepts `Authorization: Bearer <CRON_SECRET>` and syncs all approved users — call it from a Railway Cron service every 15 min. On-demand sync still works from the Calendar page Refresh button.
- **Calendar event cache**: `CalendarEvent` table stores all events per user from master calendar + iCal feeds. The Calendar view reads from this table; `POST /api/calendar/sync` populates it.
- **PWA**: Custom `manifest.json` + `sw.js` with cache-first static, network-first API strategy.

---

## Environment Variables

Only infrastructure-level vars live in Railway. All OAuth credentials are stored in the DB via `/setup`.

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Railway Postgres (private endpoint) |
| `NEXTAUTH_URL` | `https://work-os.flexentric.com` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend dashboard |
| `ALLOWED_EMAIL_DOMAIN` | `flexentric.com` — only emails from this domain can sign in |
| `SYNC_INTERVAL_MINUTES` | Optional, default 15 |
| `USER_TIMEZONE` | Optional, default UTC |
| `PUBLIC_API_SECRET` | Secret for `/api/public/*` endpoints |
| `CRON_SECRET` | Random secret for Railway Cron → `POST /api/calendar/sync` |

---

## Database Schema

Key models:

| Model | Purpose |
|-------|---------|
| `BookingPage` | Per-user booking page config: slug, name, durations, schedule (WeeklySchedule JSON), calendarSources, timezone |
| `Booking` | Individual booking record: guest details, startAt/endAt, teamsLink, outlookEventId, status |
| `AppConfig` | Singleton row. App-level OAuth credentials (Google, Microsoft). Read by NextAuth at runtime. |
| `User` | NextAuth user + `isApproved` flag |
| `Account` / `Session` / `VerificationToken` | NextAuth standard models. Provider `'google'` or `'microsoft-entra-id'` determines master calendar. |
| `UserSettings` | Per-user API keys, sync interval, `masterCalendarProvider`, `masterCalendarColor`, `calendarId`, `calendarSyncedAt` |
| `CalendarConnection` | iCal connections (sourceType `'ical'`). Has `color` field for calendar view. |
| `CalendarEvent` | Unified event cache per user. `source = "master"` or `CalendarConnection.id`. Populated by `/api/calendar/sync`. |
| `EventMapping` | Legacy: maps synced events between source and Google Calendar (used by sync-engine, not the calendar view) |
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
| `masterCalendarProvider` | `'google'` or `'microsoft'` — always derived from OAuth Account at runtime, not trusted from DB |
| `masterCalendarColor` | Hex color for master calendar in the calendar view (default `#007AFF`) |
| `calendarId` | Selected calendar ID within the master account |
| `syncInterval` | Minutes between iCal sync runs (default 15) — `Int`, coerced in API |
| `calendarStartHour` | First visible hour in the calendar view (default 0 = midnight) — `Int` |
| `calendarEndHour` | Last visible hour in the calendar view (default 24) — `Int` |
| `calendarSyncedAt` | Timestamp of last successful `/api/calendar/sync` run |

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
| Google | `https://work-os.flexentric.com/api/auth/callback/google` |
| Microsoft | `https://work-os.flexentric.com/api/auth/callback/microsoft-entra-id` |
| Google (dev) | `http://localhost:3000/api/auth/callback/google` |
| Microsoft (dev) | `http://localhost:3000/api/auth/callback/microsoft-entra-id` |

---

## Authentication

- Providers: **Microsoft Entra ID** (Google disabled — commented out, re-enable if migrating)
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

### Calendar View (`/calendar`)
- Week view: Mon–Sun day columns, time grid (56 px/hour), all-day strip, overlap-aware event layout, today line
- Events read from `CalendarEvent` DB table (fast, no live API call on render)
- On page load: shows cached events immediately, then triggers `POST /api/calendar/sync` in background
- Manual Refresh button re-runs sync and reloads events
- Live legend showing which calendar each color represents
- **Sync** (`POST /api/calendar/sync`): fetches master calendar (MS Graph `calendarView` or Google `events.list`) + all active iCal feeds; upserts into `CalendarEvent`; prunes stale entries. Window: 30 days back → 120 days forward.
- **iCal RRULE expansion**: `lib/ical.ts` expands recurring events (`RRULE`) into individual instances within the sync window. Handles `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY`, `INTERVAL`, `UNTIL`, `COUNT`, `BYDAY`, `BYMONTHDAY`, `EXDATE`, and `RECURRENCE-ID` exception overrides. Each expanded instance gets a stable `uid = originalUid:instanceStartIso` for DB upsert. No external library — implemented inline. DST-aware: expansion works in the event's local timezone (from `DTSTART;TZID=...`) so the wall-clock time stays constant across summer/winter transitions.
- **Background sync via Railway Cron** — `POST /api/calendar/sync` accepts `Authorization: Bearer <CRON_SECRET>` (env var) to sync all approved users without a session. Set up a Railway Cron service with `*/15 * * * *` schedule running: `curl -s -X POST https://work-os.flexentric.com/api/calendar/sync -H "Authorization: Bearer $CRON_SECRET"`

### Calendar Settings (in `/settings → Calendar`)
- Master account color picker: 10-color Apple Calendar palette
- Per-iCal-connection color picker: click the color dot to expand inline palette
- Colors stored in `UserSettings.masterCalendarColor` and `CalendarConnection.color`
- Primary calendar select, sync interval setting
- **Calendar view hours**: start/end hour inputs (`calendarStartHour`, `calendarEndHour`) — controls which hours the week grid renders; defaults 0–24
- `POST /api/settings` builds a typed Prisma update and coerces all `Int` fields via `parseInt`; returns the saved record so the UI always reflects actual DB values

### Booking (`/booking` + `/settings → Booking`)

A Calendly-style booking system. External users book meetings via a Lovable-built frontend at `flexentric.com/booking/[slug]`; Work OS serves as the backend.

**Public API** (CORS: `flexentric.com`, no token required):
- `GET /api/public/availability?slug=ap&duration=30&days=14` — returns available time slots based on the booking page's schedule and busy calendar intervals
- `POST /api/public/bookings` — creates a booking: validates slot, creates Outlook event with Teams link, stores Booking record, sends Resend emails to guest and Alex

**Authenticated API**:
- `GET/POST /api/booking-pages` — list / create booking pages
- `PATCH/DELETE /api/booking-pages/[id]` — update / delete
- `GET /api/bookings` — list all bookings across the user's booking pages (ordered by startAt desc)

**Booking flow** (fully auto-approved):
1. Guest picks duration → date/time → fills in name, email, company, subject, notes, location
2. Work OS re-validates the slot is free, creates an Outlook calendar event with Teams join URL
3. Outlook auto-sends calendar invite to guest; Resend sends confirmation email (with Teams link) to guest and notification email to Alex

**Busy-interval sources** (availability GET and bookings POST re-validation):
- Live MS Graph call for master calendar (fresh data)
- `CalendarEvent` cache for **all** `calendarSources` (master + iCal) — ensures whatever is visible in the calendar view also blocks booking slots
- Existing `Booking` records for this booking page

**Lovable → Work OS migration** (minimal changes):
- Change base URL to `work-os.flexentric.com`
- Add `?slug=ap` to availability GET call
- Add `slug: "ap"` field to bookings POST body

**Settings (Booking pages)**:
Each booking page has: name, slug (URL), allowed durations (15/30/60/90/120 min), per-day schedule (unavailable toggle + start/end hours), calendar sources (master and/or iCal connections), timezone.

**`/booking` nav page**: Multi-step booking flow (Duration → Date & Time → Details → Confirmation) plus a Bookings tab listing upcoming/past bookings with Teams links. Schedule grid in Settings shows Mon → Sun. Time slots display in the booking page timezone using wall-clock extraction from the ISO string (no UTC conversion) to avoid offset shift.

**Emails**:
- `BookingConfirmation.tsx` — sent to guest with meeting details and Teams join button
- `BookingNotification.tsx` — sent to Alex with full guest and meeting details

### Legacy Calendar Sync (iCal → Google/Microsoft)
- `lib/sync-engine.ts` syncs iCal feeds into the master calendar via Google Calendar API or MS Graph
- Only supports Google as target; Microsoft-master users' iCal feeds do not sync
- `sync-worker.ts` runs this on a cron schedule but is not deployed on Railway
- Public availability API: `GET /api/public/availability` — reads from master calendar
- Core logic: `lib/google.ts`, `lib/microsoft.ts`, `lib/sync-engine.ts`, `lib/ical.ts`, `lib/freebusy.ts`

### Settings (`/settings`)

Sidebar navigation with three groups:

**General**
- API Keys: Anthropic, OpenAI
- Import / Export: downloads/uploads a Markdown file with API keys, formats, tones, and iCal connections

**Translation**
- Formats: user-defined formats (create / edit / reorder)
- Tones: user-defined tones (create / edit / reorder)

**Calendar**
- Master account: provider + email + Apple color picker (10 colors)
- Primary calendar: `<select>` populated from `GET /api/calendar/calendars`; auto-selects primary; falls back to text input if API unavailable
- Sync interval (minutes)
- iCal connections: list with color dot (click to expand inline color picker), Active/Paused toggle, Delete; Add iCal feed form

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/setup` | GET / POST | Read / write AppConfig (admin only after initial setup) |
| `/api/settings` | GET / POST | Read / write UserSettings (incl. `masterCalendarColor`) |
| `/api/tones` | GET / POST | List / create tones |
| `/api/tones/[id]` | PATCH / DELETE | Edit / delete tone |
| `/api/formats` | GET / POST | List / create formats |
| `/api/formats/[id]` | PATCH / DELETE | Edit / delete format |
| `/api/translate` | POST | Claude translation |
| `/api/transcribe` | POST | Whisper transcription |
| `/api/calendar/calendars` | GET | List calendars from master account |
| `/api/calendar/connections` | GET / POST | List / create iCal connections (returns `color`) |
| `/api/calendar/connections/[id]` | PATCH / DELETE | Update color or toggle active / delete |
| `/api/calendar/sync` | POST | Sync master calendar + iCal feeds into `CalendarEvent` table |
| `/api/calendar/events` | GET `?start&end` | Read `CalendarEvent` rows for date range |
| `/api/public/availability` | GET `?slug&duration&days` | Available slots for a booking page (checks master + iCal + existing bookings) |
| `/api/public/bookings` | POST | Create a booking (auto-approved, creates Outlook event + Teams link, sends emails) |
| `/api/booking-pages` | GET / POST | List / create booking pages |
| `/api/booking-pages/[id]` | PATCH / DELETE | Update / delete booking page |
| `/api/bookings` | GET | List all bookings across the user's booking pages |
| `/api/public/availability` (legacy) | GET | Public free/busy (reads master calendar) |

---

## Email (Resend)

| Template | Trigger |
|----------|---------|
| `ApprovalPending` | On new user signup — sent to the new user |
| `AdminApprovalNotification` | On new user signup — sent to `alex@flexentric.com` with link to `/admin` |
| `Welcome` | On admin approval — sent to the approved user |

Sender: `Work OS <work-os@flexentric.com>`

---

## Deployment (Railway)

- Build command (via `package.json`): `prisma generate && next build`
- Start command (via `railway.json`): `prisma migrate deploy && npm start`
- One service: `web` (Next.js) — no worker service deployed
- Custom domain: `work-os.flexentric.com`
- Local dev DB: `.env` points to Railway public proxy (`shinkansen.proxy.rlwy.net:12393`) — `npx prisma migrate dev` and `npx prisma studio` work without any prefix
