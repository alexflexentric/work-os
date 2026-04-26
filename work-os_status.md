# Work OS - Status

**Last updated**: 2026-04-26

---

## Just Completed

**Fix build: useRouter scope error** (2026-04-26)

- `settings/page.tsx` — `const router = useRouter()` was declared inside `SettingsPage` but used inside `ImportExportPanel`, which is a module-level function defined outside `SettingsPage` (no closure access)
- Fix: moved `useRouter()` hook into `ImportExportPanel` where it's actually used; removed from `SettingsPage`
- Commit: `791e6b6`

---

**Railway Cron: calendar sync live** (2026-04-26)

- `calendar-sync-cron` Railway Cron service deployed, running every 15 minutes
- Source image: `curlimages/curl`; start command: `curl -s -X POST https://work-os.flexentric.com/api/calendar/sync -H "Authorization: Bearer $CRON_SECRET"`
- `CRON_SECRET` set in both web service and cron service Railway env vars
- Status: Ready / running autonomously

---

**Calendar sync: CRON_SECRET auth** (2026-04-26)

- `POST /api/calendar/sync` now accepts `Authorization: Bearer <CRON_SECRET>` — syncs **all approved users** when called with the secret
- Sync logic extracted into `syncUser(userId)` helper; session path unchanged (syncs only logged-in user)

---

**Fix overbooking: CalendarEvent cache in availability check** (2026-04-26)

- All four booking routes (availability GET + bookings POST, both authenticated and public) now query `CalendarEvent` for **all** `calendarSources` (master + iCal) in addition to the live MS Graph call
- Previously: master calendar → live MS Graph only (silently returns `[]` on token errors); iCal → CalendarEvent cache. Recurring meetings visible in the calendar were not blocking slots.
- Fix: `cachedBusy` pulls from `CalendarEvent` for all configured sources; merged with `masterBusy` (live) and `bookingBusy`

---

**Root redirect + nav stability** (2026-04-26)

- `middleware.ts` — authenticated users hitting `/` are redirected to `/home` at the edge (session cookie check), preventing the sign-in page crash for logged-in users
- `settings/page.tsx` — `window.location.reload()` → `router.refresh()` after import; hard reload briefly routed through `/`, causing nav to disappear
- `Nav.tsx` — `pathname?.startsWith()` optional chaining on mobile tab bar (matches desktop sidebar behavior)

---

**Booking UI polish** (2026-04-26)

- Timezone display bug fixed: `localIso + "Z"` was shifting times by +2h in Brussels (UTC+2); replaced with `wallClockToUtcDate()` that parses ISO components and formats via UTC
- Duration pill active state: `bg-accent text-white border-accent` (was `bg-[--foreground]`)
- Schedule grid now displays Mon → Sun (was Sun-first); underlying data indices unchanged

---

## Current State

All core features live at `work-os.flexentric.com`. Web service is redeploying from `791e6b6`.

### What works
- `/setup` wizard — Microsoft OAuth credential onboarding
- Sign-in — Microsoft only (`@flexentric.com` domain restricted)
- Admin approval gate — `alex@flexentric.com` approves users; email notification sent on signup
- Translation — text + voice (Whisper) → Claude, with DB-driven formats and tones
- Settings — API Keys, Import/Export, Formats/Tones CRUD, Calendar (colors, primary calendar, sync interval, iCal connections), Booking pages CRUD
- Calendar view — week view, color-coded by source, auto-syncs on load + manual Refresh
- **Background calendar sync** — Railway Cron running every 15 min via `CRON_SECRET`
- Booking system — full internal `/booking` page flow (Duration → Date/Time → Details → Confirmation); public API for Lovable frontend
- Overbooking fix — recurring meetings now block booking slots (CalendarEvent cache checked for all sources)

### Known limitations / open tasks
- **Booking/Navigation: needs testing** — verify booking flow end-to-end, nav stability across all pages, correct time display in booking UI
- **Lovable migration** — update Lovable frontend: change base URL to `work-os.flexentric.com`, add `?slug=ap` to availability GET, add `slug: "ap"` to bookings POST body
- **iCal → master calendar sync (legacy)** — `sync-engine.ts` only supports Google as sync target; Microsoft-master users' iCal feeds aren't written to their MS calendar. The `CalendarEvent` table shows them correctly in the UI regardless.
- **PWA icons** — `public/icon-192.png` and `public/icon-512.png` not yet added.

---

## Next Session: Start Here

1. **Test booking flow** — open `/booking`, create a test booking end-to-end; verify:
   - Time slots display correct times (no +2h shift)
   - Busy slots (recurring meetings) are blocked
   - Confirmation screen shows correct time + Teams link
   - Guest confirmation email arrives with correct time
2. **Test navigation stability** — click through all nav items (Home, Translation, Calendar, Booking, Settings); verify nav stays visible and active item highlights correctly; test on mobile viewport
3. **Lovable migration** (if booking tests pass) — update Lovable frontend base URL + slug params
4. **iCal → Microsoft Calendar sync** — update `sync-engine.ts` to support Microsoft as sync target
5. **PWA icons** — add `public/icon-192.png` and `public/icon-512.png`

---

## Railway Notes

- Services: `web` (Next.js) + `calendar-sync-cron` (curlimages/curl, 15-min cron)
- Build: `prisma generate && next build`
- Start: `prisma migrate deploy && npm start`
- Local `.env` uses Railway public proxy URL — all Prisma CLI commands work without prefix
- `CRON_SECRET` must be set in both services' env vars
