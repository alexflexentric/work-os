# Work OS - Status

**Last updated**: 2026-04-21

---

## Just Completed

Full v1 build:
- Next.js 16 app scaffolded with TypeScript + Tailwind
- Prisma 7 schema (User, UserSettings, Tone, CalendarConnection, EventMapping, PendingBooking)
- NextAuth v5 (Google OAuth + PrismaAdapter + `isApproved` gate)
- Admin page at `/admin` — protected to `alex@fafo-studio.com`, one-click approval + Welcome email
- Resend emails: `ApprovalPending` on signup, `Welcome` on approval
- Translation feature: `/translation` page + `/api/transcribe` (Whisper) + `/api/translate` (Claude)
- Calendar sync: ported from Calypso (`google.ts`, `microsoft.ts`, `sync-engine.ts`, `ical.ts`, `freebusy.ts`)
- Worker: `src/workers/sync-worker.ts` with node-cron
- Public availability API: `GET /api/public/availability`
- Settings UI: API Keys + Tones tabs
- PWA: `manifest.json` + `sw.js`
- Railway config: `railway.json` + `Procfile`
- TypeScript: passes `tsc --noEmit` clean

---

## Next Steps

1. **Set up Railway** — create project, add Postgres service, set env vars (see below)
2. **Run first migration** — `npx prisma migrate dev --name init` locally, then `prisma migrate deploy` on Railway
3. **Add icons** — add `public/icon-192.png` and `public/icon-512.png` for PWA
4. **Add Google OAuth redirect URI** — `https://work-os.fafo-studio.com/api/auth/callback/google` in Google Console
5. **Test end-to-end** — signup → approval email → admin approves → welcome email → translation works

---

## Required Environment Variables

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Railway Postgres connection string |
| `NEXTAUTH_URL` | `https://work-os.fafo-studio.com` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth app |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app |
| `RESEND_API_KEY` | Resend dashboard |
| `SYNC_INTERVAL_MINUTES` | Optional, default 15 |
| `USER_TIMEZONE` | Optional, default UTC (for availability API) |
| `PUBLIC_API_SECRET` | Secret for `/api/public/*` endpoints |

---

## Open Questions / Blockers

- None blocking. PWA icons need to be added before install prompt works.
