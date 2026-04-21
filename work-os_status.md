# Work OS - Status

**Last updated**: 2026-04-21

---

## Just Completed

Full v1 build + Railway deployment fixes:
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

Deployment is in progress (build `50f32e71`). Expected to succeed.

---

## Next Steps

1. **Confirm build green** — watch Railway logs at the URL from the last `railway up` output
2. **Add custom domain** — Railway dashboard → web service → Settings → Networking → add `work-os.fafo-studio.com`, then point DNS
3. **Run first DB migration** — `npx prisma migrate dev --name init` locally, then it auto-runs on deploy via `prisma migrate deploy` in startCommand
4. **Add PWA icons** — `public/icon-192.png` and `public/icon-512.png`
5. **Test end-to-end** — signup → approval email → admin approves → welcome email → translation works

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

- Build `50f32e71` in progress — may still fail if there are other TS errors in Calypso-ported files
- PWA icons need to be added before install prompt works
- Google OAuth app is "unverified" (fine for personal/small team use; would need Google verification for public launch)
