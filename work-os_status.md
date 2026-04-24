# Work OS - Status

**Last updated**: 2026-04-24

---

## Just Completed

- Settings page refactored: segmented tab control (API Keys / Tones). Formats temporarily removed.
- Translation page: static format pills (temporary), clear (X) button added to text area
- Translate API: hardcoded format instructions (temporary)
- **Fix**: Removed `prisma migrate deploy` from build script — was failing at build time
- MD files updated to reflect new architecture (setup wizard, AppConfig, dual provider)

---

## In Progress

Large feature branch — **setup wizard + dual OAuth + settings restructure + calendar**

### Stage 1 — AppConfig schema + setup wizard (next)
- [ ] Prisma migration: add `AppConfig` model (singleton, Google + Microsoft credentials)
- [ ] Prisma migration: add `masterCalendarProvider String @default("google")` to `UserSettings`; remove `microsoftClientId/Secret/TenantId` from `UserSettings`
- [ ] `/setup` page — multi-step wizard with in-UI OAuth app instructions:
  - Step 1: Google (client ID + secret, instructions + redirect URIs shown)
  - Step 2: Microsoft (client ID + secret + tenant ID, instructions + redirect URIs shown)
  - At least one required; each step skippable
  - Step 3: Done → redirect to sign-in
- [ ] `GET/POST /api/setup` route — unauthenticated GET to check if setup is complete; POST saves to `AppConfig` (admin only once set up)
- [ ] Middleware update: if `AppConfig` empty → redirect all routes to `/setup`

### Stage 2 — Dynamic NextAuth providers
- [ ] Refactor `src/auth.ts` to read provider credentials from `AppConfig` at request time
- [ ] Support Google, Microsoft, or both based on what is configured
- [ ] Ensure Microsoft scopes include `Calendars.ReadWrite` and `offline_access`
- [ ] Ensure approval gate applies to Microsoft sign-ups

### Stage 3 — Settings page UI
- [ ] Sidebar nav: General › API Keys, Translation › Formats + Tones, Calendar
- [ ] Restore Formats panel (create / edit / reorder)
- [ ] Calendar section: master account info, primary calendar selector, sync interval, iCal connections

### Stage 4 — Translation page + translate API
- [ ] Format: static pills → dropdown (DB-driven, like Tone)
- [ ] `/api/translate`: restore `formatId` DB lookup

### Stage 5 — Calendar API routes + availability
- [ ] `GET /api/calendar/calendars` — list calendars from master account (Google or Microsoft)
- [ ] `GET/POST /api/calendar/connections` — list / create iCal connections
- [ ] `DELETE/PATCH /api/calendar/connections/[id]` — delete / toggle active
- [ ] `GET /api/public/availability` — route to Google or Microsoft based on `masterCalendarProvider`
- [ ] Add `listMicrosoftCalendars(userId)` to `lib/microsoft.ts`
- [ ] Update sync worker to sync iCal into master calendar

---

## Railway Build Notes

- Build command (via `package.json`): `prisma generate && next build`
- Start command (via `railway.json`): `prisma migrate deploy && npm start`
- Worker: `npx tsx src/workers/sync-worker.ts` (separate Railway service)

---

## Required Environment Variables (Railway)

Only infra-level — OAuth credentials moved to DB via `/setup`

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Railway Postgres connection string |
| `NEXTAUTH_URL` | `https://work-os.fafo-studio.com` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend dashboard |
| `SYNC_INTERVAL_MINUTES` | Optional, default 15 |
| `USER_TIMEZONE` | Optional, default UTC |
| `PUBLIC_API_SECRET` | Secret for `/api/public/*` endpoints |

---

## Open Questions / Blockers

- None currently — ready to start Stage 1
- PWA icons still not added (`public/icon-192.png`, `public/icon-512.png`)
