# Work OS - Documentation

**Version**: 1.0 (2026-04-21)
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
- **Tina**: AI-powered translation (text + voice via Whisper → Claude)
- **Calypso**: Calendar sync (Google + Microsoft → unified view + public booking API)

Each user brings their own API keys (Anthropic, OpenAI, Microsoft). Google OAuth is shared (app-level). All data is strictly scoped by `userId`.

### Key Architectural Decisions
- **Per-user API keys**: Users pay their own LLM/Whisper bills. Keys stored encrypted in `UserSettings`.
- **Admin approval gate**: `User.isApproved` flag; unapproved users are redirected to `/approval-pending`. Approval triggers a Welcome email via Resend.
- **Worker service**: Separate Railway worker runs cron sync every 15 min for approved users.
- **PWA**: Custom `manifest.json` + `sw.js` with cache-first static, network-first API strategy.

---

## Database Schema

See `work-os_briefing.md` for full Prisma schema. Key models:

| Model | Purpose |
|-------|---------|
| `User` | NextAuth user + `isApproved` flag |
| `Account` / `Session` / `VerificationToken` | NextAuth standard models |
| `UserSettings` | Per-user API keys, sync interval |
| `CalendarConnection` | Google/MS calendar connections |
| `EventMapping` | Synced event records |
| `Tone` | User-defined translation tones |

---

## Authentication

- Provider: Google OAuth (NextAuth v5 + Prisma adapter)
- Middleware enforces: unauthenticated → `/auth/signin`, authenticated + unapproved → `/approval-pending`
- `signUp` callback triggers `sendApprovalEmail()`

---

## Features

### Translation (`/translation`)
- Text input or mic recording → OpenAI Whisper transcription → Claude translation
- User selects target language, format, and tone
- Output supports copy and text-to-speech
- API routes: `POST /api/transcribe`, `POST /api/translate`

### Calendar Sync
- Connects Google Calendar and Microsoft 365 calendars
- Cron worker syncs every 15 min for all approved users
- Public availability API: `GET /api/public/availability`
- Core logic ported from Calypso (`lib/google.ts`, `lib/microsoft.ts`, `lib/sync-engine.ts`)

### Settings (`/settings`)
- Tabs: API Keys | Calendar | Tones
- API Keys: Anthropic, OpenAI, Microsoft OAuth credentials
- Tones: Custom translation tone definitions

---

## Email (Resend)

| Template | Trigger |
|----------|---------|
| `ApprovalPending` | On new user signup |
| `Welcome` | On admin approval |

Sender: `Work OS <support@fafo-studio.com>`

---

## Deployment (Railway)

- Build command: `prisma generate && prisma migrate deploy && next build`
- Two services: `web` (Next.js) and `worker` (node-cron)
- Required env vars: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `GOOGLECLIENTID`, `GOOGLE_CLIENT_SECRET`
- Custom domain: `work-os.fafo-studio.com`

---

## Build Order

1. Auth (NextAuth + Prisma + approval flow + emails)
2. Translation (Whisper + Claude + tones)
3. Calendar Sync (Calypso port + worker)
4. Settings UI
5. PWA (manifest + service worker)
