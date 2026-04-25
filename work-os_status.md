# Work OS - Status

**Last updated**: 2026-04-25

---

## Just Completed

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

All core features live at `work-os.fafo-studio.com`.

### What works
- `/setup` wizard — Google/Microsoft OAuth credential onboarding
- Sign-in — Google and/or Microsoft (whichever is configured in AppConfig)
- Admin approval gate — `alex@fafo-studio.com` approves users; email notification sent on signup
- Translation — text + voice (Whisper) → Claude, with DB-driven formats and tones
- Settings — API Keys, Import/Export, Formats (CRUD + reorder), Tones (CRUD + reorder), Calendar (color pickers, primary calendar, sync interval, iCal connections CRUD)
- Calendar view — week view, color-coded by source, syncs from master + iCal on load
- Public availability API

### Known limitations / open tasks
- **No background calendar sync** — `sync-worker.ts` (node-cron) is not deployed on Railway. Calendar syncs only when the user opens the page or clicks Refresh. Fix: add a Railway Cron service calling `POST /api/calendar/sync`.
- **iCal → master calendar sync (legacy)** — `sync-engine.ts` only supports Google as sync target; Microsoft-master users' iCal feeds aren't written to their MS calendar. The new `CalendarEvent` table shows them correctly in the UI regardless.
- **Admin email mismatch** — `/admin` page checks for `alex@fafo-studio.com` but the actual user email is `alex@flexentric.com`. Admin page is inaccessible.
- **PWA icons** — `public/icon-192.png` and `public/icon-512.png` not yet added.

---

## Next Steps (in priority order)

1. **Railway Cron for calendar sync** — add a Cron service calling `POST https://work-os.fafo-studio.com/api/calendar/sync` every 15 min
2. **Fix admin email** — change the admin gate in `/admin/page.tsx` from `alex@fafo-studio.com` to `alex@flexentric.com`
3. **iCal → Microsoft Calendar sync** — update `sync-engine.ts` to support Microsoft as sync target (requires `targetMicrosoftCalendarId` field + MS Graph event CRUD in sync loop)
4. **PWA icons** — add `public/icon-192.png` and `public/icon-512.png`

---

## Railway Notes

- One service: `web` (Next.js). No worker service.
- Build: `prisma generate && next build`
- Start: `prisma migrate deploy && npm start`
- Local `.env` uses Railway public proxy URL — all Prisma CLI commands work without prefix
