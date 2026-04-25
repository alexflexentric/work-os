# Work OS - Status

**Last updated**: 2026-04-25

---

## Just Completed

**Booking system** (2026-04-25)

- New `BookingPage` and `Booking` Prisma models; migration at `20260425300000_add_booking_pages`
- `BookingPage` — per-user, stores slug (unique), name, allowed durations (Int[]), schedule (WeeklySchedule JSON), calendarSources (String[]), timezone
- `Booking` — linked to BookingPage; stores guest details, startAt/endAt, teamsLink, outlookEventId, status (auto-approved)
- `public-api-guard.ts` — dropped `x-booking-token` requirement; CORS-only (flexentric.com)
- `GET /api/public/availability?slug=ap&duration=30&days=14` — rewrote to look up booking page by slug, use its per-page schedule + calendarSources; also checks existing Booking records for conflicts; iCal sources read from CalendarEvent cache; master calendar calls MS Graph
- `POST /api/public/bookings` — new route: validate fields → check slot free → create Outlook event with Teams link via `createBookingCalendarEvent` → store Booking → send Resend emails (non-blocking)
- `GET/POST /api/booking-pages`, `PATCH/DELETE /api/booking-pages/[id]` — authenticated CRUD
- `GET /api/bookings` — list all bookings across user's booking pages
- `BookingConfirmation.tsx` + `BookingNotification.tsx` email templates; `sendBookingConfirmationEmail` / `sendBookingNotificationEmail` in email.ts
- "Booking" group added to Settings sidebar → BookingPanel component: list + create/edit form with name, slug, duration checkboxes, 7-day schedule grid, calendar source checkboxes, timezone selector
- "Booking" nav item added to Nav.tsx (BookOpen icon)
- `/booking` page: lists all bookings split into Upcoming / Past with guest details and Teams link

**Lovable migration** (minimal changes needed):
1. Change base URL to `work-os.flexentric.com`
2. Add `?slug=ap` to availability GET
3. Add `slug: "ap"` to bookings POST body

---



**iCal recurring event expansion + DST fix** (2026-04-25)

- `lib/ical.ts` — rewrote to expand `RRULE` into individual instances within the sync window instead of storing only the master (first) occurrence
- Handles `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY`, `INTERVAL`, `UNTIL`, `COUNT`, `BYDAY`, `BYMONTHDAY`
- Handles `EXDATE` (per-instance exclusions) and `RECURRENCE-ID` exception VEVENTs (moved or cancelled instances)
- Each expanded instance stored with stable `uid = originalUid:instanceStartIso` — allows the DB upsert to address each instance independently
- DST-correct: expansion works in local calendar dates (using `DTSTART;TZID`) so the wall-clock time stays constant (e.g. "09:00 Warsaw" stays at 09:00 in both CET and CEST); without TZID, expands in UTC as before
- `fetchAndParseIcal` now accepts optional `windowStart`/`windowEnd` and passes them through; sync route passes the existing 30-back/120-ahead window
- No new npm dependency — RRULE expansion implemented inline
- First sync after deploy will clean up old single-occurrence rows and create the expanded set

**Calendar view hour range + settings save fixes** (2026-04-25)

- `calendarStartHour` (default 0) and `calendarEndHour` (default 24) added to `UserSettings` — calendar view renders only the visible hour range
- Settings save was silently failing: `Record<string, string>` state sent strings for `Int` fields, causing Prisma validation errors with no user-visible feedback
- Fixed `POST /api/settings` to build a properly-typed Prisma update object, coercing all three `Int` fields (`syncInterval`, `calendarStartHour`, `calendarEndHour`) via `parseInt`
- Added `try/catch` to the route so errors return `{ error }` with status 500 instead of crashing
- Settings page save now only shows "Saved" when `res.ok`, and refreshes local state from the API response so inputs reflect the actual DB values
- Calendar view uses `Number()` coercion as a safety net when reading the hour settings from the API

**Fix Railway build failure: Prisma config** (2026-04-25)

- `prisma.config.ts` (Prisma v7 auto-generated) was failing to load in the Railway build environment ("Failed to load config file as a TypeScript/JavaScript module")
- Deleted `prisma.config.ts` and restored `url = env("DATABASE_URL")` to the `datasource db` block in `prisma/schema.prisma` — the traditional approach that doesn't require TypeScript config loading

---

**Google disabled + admin auto-approve + email sender** (2026-04-25)

- Google sign-in/sign-up commented out across `auth.ts`, `SignInButtons.tsx`, `setup/page.tsx` — Microsoft-only
- Setup wizard is now a 2-step flow (Microsoft → Done)
- Admin (`alex@flexentric.com`) is auto-approved on first sign-in via `createUser` event
- Email FROM changed to `work-os@flexentric.com`

**Domain migration + org restriction** (2026-04-25)

- All `fafo-studio.com` references replaced with `flexentric.com` across source, emails, and docs
- `ALLOWED_EMAIL_DOMAIN` env var controls which email domain can sign in (set to `flexentric.com`)
- Sign-in callback in `src/auth.ts` rejects non-`@flexentric.com` emails and redirects to `/?error=OrgRestricted`
- Sign-in page shows friendly message: "Sign-in is limited to @flexentric.com email addresses"
- Admin email updated to `alex@flexentric.com` in `/admin`, `/api/setup`, and `email.ts`
- Deployment URL: `https://work-os.flexentric.com`

---

**Calendar view + event cache** (2026-04-25)

- New `CalendarEvent` DB table — unified event cache per user (`source = "master"` or `CalendarConnection.id`)
- `POST /api/calendar/sync` — fetches MS Graph `calendarView` or Google `events.list` + all active iCal feeds, upserts into `CalendarEvent`, prunes stale entries (window: 30 days back → 120 days forward)
- `GET /api/calendar/events?start&end` — reads from `CalendarEvent` table for the requested week
- `/calendar` week view — day columns, time grid (56 px/hour), all-day strip, overlap-aware layout, today line, auto-sync on load + Refresh button, live legend
- Apple Calendar color palette (10 colors) in Settings → Calendar — master account color picker + per-connection inline color picker (click color dot to expand)
- `masterCalendarColor` added to `UserSettings`; `color` was already on `CalendarConnection`

**masterCalendarProvider fix** (2026-04-25)

- `GET /api/settings` now always derives `masterCalendarProvider` from the OAuth `Account` table, ignoring any stale stored value — Microsoft users correctly see "Microsoft" in Calendar settings

**iCal connections in Import/Export** (2026-04-25)

- Export includes `## iCal Connections` section; import deduplicates by URL and adds new ones sequentially

---

## Current State

All core features live at `work-os.flexentric.com`.

### What works
- `/setup` wizard — Google/Microsoft OAuth credential onboarding
- Sign-in — Google and/or Microsoft (whichever is configured in AppConfig)
- Admin approval gate — `alex@flexentric.com` approves users; email notification sent on signup
- Translation — text + voice (Whisper) → Claude, with DB-driven formats and tones
- Settings — API Keys, Import/Export, Formats (CRUD + reorder), Tones (CRUD + reorder), Calendar (color pickers, primary calendar, sync interval, iCal connections CRUD)
- Calendar view — week view, color-coded by source, syncs from master + iCal on load
- Public availability API

### Known limitations / open tasks
- **No background calendar sync** — `sync-worker.ts` (node-cron) is not deployed on Railway. Calendar syncs only when the user opens the page or clicks Refresh. Fix: add a Railway Cron service calling `POST /api/calendar/sync`.
- **iCal → master calendar sync (legacy)** — `sync-engine.ts` only supports Google as sync target; Microsoft-master users' iCal feeds aren't written to their MS calendar. The new `CalendarEvent` table shows them correctly in the UI regardless.
- ~~**Admin email mismatch**~~ — fixed, admin gate now checks `alex@flexentric.com`
- **PWA icons** — `public/icon-192.png` and `public/icon-512.png` not yet added.
- **Booking: Lovable migration** — update Lovable frontend to point to work-os.flexentric.com and add `slug` param to API calls (see status above).

---

## Next Steps (in priority order)

1. **Migrate Lovable frontend** — change base URL to work-os.flexentric.com, add `?slug=ap` to availability call, add `slug: "ap"` to bookings POST body
2. **Create booking page in Settings** — add the "ap" booking page via Settings → Booking pages; set schedule, durations, timezone
3. **Railway Cron for calendar sync** — add a Cron service calling `POST https://work-os.flexentric.com/api/calendar/sync` every 15 min
4. **iCal → Microsoft Calendar sync** — update `sync-engine.ts` to support Microsoft as sync target
5. **PWA icons** — add `public/icon-192.png` and `public/icon-512.png`

---

## Railway Notes

- One service: `web` (Next.js). No worker service.
- Build: `prisma generate && next build`
- Start: `prisma migrate deploy && npm start`
- Local `.env` uses Railway public proxy URL — all Prisma CLI commands work without prefix
