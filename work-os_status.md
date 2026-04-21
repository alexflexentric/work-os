# Work OS - Status

**Last updated**: 2026-04-21

---

## Just Completed
- Added `CLAUDE.md` (fetched from `alexflexentric/claude-config`)
- Created `work-os_documentation.md` seeded from briefing
- Created `work-os_status.md` (this file)

---

## Current State

Project is in **pre-build / spec phase**. No code has been written yet. The briefing is complete and covers full schema, auth, translation, calendar sync, settings, PWA, and Railway deploy config.

---

## Next Steps

1. Scaffold Next.js app: `npx create-next-app@16 work-os --ts --tailwind --app --src-dir --eslint`
2. Install dependencies (see briefing)
3. Set up Prisma schema + `prisma migrate dev --name init`
4. Implement Auth (NextAuth v5 + Prisma adapter + Google provider)
5. Add approval middleware + Resend emails
6. Build Translation feature (`/translation`, `/api/transcribe`, `/api/translate`)
7. Port Calypso calendar sync (`lib/google.ts`, `lib/microsoft.ts`, `lib/sync-engine.ts`)
8. Build Settings UI (API Keys, Calendar, Tones tabs)
9. Add PWA manifest + service worker
10. Configure Railway deploy (web + worker services)

---

## Open Questions / Blockers

- Does a Calypso codebase exist locally to port from, or should the calendar sync be built from scratch?
- Microsoft OAuth: will there be a shared app-level client, or is it fully per-user?
- Admin approval flow: who is the admin and how do they approve users (direct DB update, admin UI, or email link)?
