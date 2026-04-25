# Work OS - Status

**Last updated**: 2026-04-25

---

## Just Completed

**Simplify pass** — code quality cleanup after Stages 3–6 (2026-04-25)

- `TonesPanel` + `FormatsPanel` merged into a single generic `ItemPanel` (−115 lines); panels now self-fetch and self-manage state; parent `SettingsPage` no longer holds tone/format state
- `CalendarPanel` stale-closure bug fixed — `setSettings` uses functional updater; own `saving`/`saved` state (was incorrectly shared with API Keys form); `eslint-disable` removed
- Chevron SVG data URI extracted to `CHEVRON_STYLE` constant in both `settings/page.tsx` and `translation/page.tsx` (was duplicated 3×)
- `microsoft.ts`: `getMsTokenUrl` + `getMsClientCredentials` merged into `getMsAppConfig()` — one DB read per token refresh instead of two
- `google.ts`: `Account` fetch and `createOAuth2Client()` parallelised with `Promise.all`; unused `CALENDAR_SCOPE` constant removed
- Connections POST route: redundant `.trim()` calls reduced to one pass

**Stage 6** — Settings Calendar panel upgrade (2026-04-25)

- `CalendarPanel` rewritten as a stateful component with its own hooks
- Primary calendar `<select>` populated from `GET /api/calendar/calendars`; auto-selects primary; falls back to text input if API unavailable
- iCal connections list with Active/Paused toggle and Delete; Add iCal feed form (name + URL)
- All wired to `GET/POST /api/calendar/connections` and `PATCH/DELETE /api/calendar/connections/[id]`

---

## Current State — All core features complete

The translation + settings + calendar API are fully wired end-to-end. The app is deployable.

### What works
- `/setup` wizard — Google/Microsoft OAuth credential onboarding
- Sign-in — Google and/or Microsoft (whichever is configured in AppConfig)
- Admin approval gate — `alex@fafo-studio.com` approves users
- Translation — text + voice (Whisper) → Claude, with DB-driven formats and tones
- Settings — API Keys, Formats (CRUD + reorder), Tones (CRUD + reorder), Calendar (primary calendar select, sync interval, iCal connections CRUD)
- Calendar API — list calendars, manage iCal connections, public availability endpoint
- Sync worker — iCal → Google Calendar sync (cron, per-user)

### Known limitations / open tasks
- **iCal → Microsoft Calendar sync**: sync engine only supports Google as target; Microsoft-master users' iCal feeds won't sync yet
- **PWA icons**: `public/icon-192.png` and `public/icon-512.png` not yet added
- **`/api/auth/[...nextauth]/route.ts`**: pre-existing TS error (`Request` vs `NextRequest`) — does not affect runtime

---

## Next Steps (in priority order)

1. **Deploy + smoke test** on Railway — run `prisma migrate deploy`, verify setup wizard, sign-in, translate, settings
2. **iCal → Microsoft sync** — update `sync-engine.ts` and `CalendarConnection` model to support Microsoft as the sync target (requires `targetMicrosoftCalendarId` field + MS Graph event create/update/delete in sync loop)
3. **PWA icons** — add `public/icon-192.png` and `public/icon-512.png` to complete the manifest

---

## Railway Build Notes

- Build command (via `package.json`): `prisma generate && next build`
- Start command (via `railway.json`): `prisma migrate deploy && npm start`
- Worker: `npx tsx src/workers/sync-worker.ts` (separate Railway service)

---

## Required Environment Variables (Railway)

Only infra-level — OAuth credentials stored in DB via `/setup`

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Railway Postgres connection string |
| `NEXTAUTH_URL` | `https://work-os.fafo-studio.com` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend dashboard |
| `SYNC_INTERVAL_MINUTES` | Optional, default 15 |
| `USER_TIMEZONE` | Optional, default UTC |
| `PUBLIC_API_SECRET` | Secret for `/api/public/*` endpoints |
