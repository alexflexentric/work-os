# Work OS - Status

**Last updated**: 2026-04-21

---

## Just Completed

Full v1 build — **deployed and green on Railway** ✓

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
- Railway project created, Postgres service added, all env vars set
- Google Cloud project `work-os` created with OAuth 2.0 client (in production, unverified)
- **Fixed**: Node engine constraint (`>=22.12.0`) for Prisma 7 compatibility
- **Fixed**: Implicit `any` TS error in admin page map (`typeof pending[number]`)
- **Fixed**: `prisma generate` added to build script so Prisma types exist during `next build`
- **Fixed**: Switched to `@prisma/adapter-pg` driver adapter — Prisma 7 requires it for the default `engineType = "client"`
- **Fixed**: Added missing `@react-email/render` dep — was crashing `createUser` event on signup
- Custom domain live: `work-os.fafo-studio.com`
- DB migrated (`20260421212915_init`) — all tables created in Railway Postgres EU West
- `DATABASE_URL` switched to private Railway endpoint (no egress fees)
- Tagline updated to "AI Powered Productivity Platform"

---

## Next Steps

1. **Test end-to-end** — sign in → approval email → go to `/admin` → approve → welcome email → translation works
2. **Add PWA icons** — `public/icon-192.png` and `public/icon-512.png`

---

## Railway Build Notes

- Build command (via `package.json`): `prisma generate && next build`
- Start command (via `railway.json`): `prisma migrate deploy && npm start`
- Worker: `npx tsx src/workers/sync-worker.ts` (separate Railway service)

---

## Required Environment Variables

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Railway Postgres connection string |
| `NEXTAUTH_URL` | `https://work-os.fafo-studio.com` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth app (`work-os` project) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app (`work-os` project) |
| `RESEND_API_KEY` | Resend dashboard |
| `SYNC_INTERVAL_MINUTES` | Optional, default 15 |
| `USER_TIMEZONE` | Optional, default UTC (for availability API) |
| `PUBLIC_API_SECRET` | Secret for `/api/public/*` endpoints |

---

## Open Questions / Blockers

- PWA icons not yet added (`public/icon-192.png`, `public/icon-512.png`) — install prompt won't work until then
- Google OAuth app is "unverified" (fine for personal/small team use; would need Google verification for public launch)
