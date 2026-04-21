# Work OS - Complete Technical Briefing Document

**Version**: 1.0 (2026-04-21)  
**Deployment**: https://work-os.fafo-studio.com (Railway custom domain)  
**Contact**: support@fafo-studio.com  
**Author**: AI-assisted spec for Claude Code build  

This document provides **full specs, schemas, code skeletons** for building Work OS—a multi-tenant PWA merging Tina translation + Calypso calendar sync. Ready for **copy-paste into Claude/VS Code**.

## 🎯 Project Goals
- **Multi-tenant PWA**: Self-signup (Google/MS OAuth), admin approval, per-user data/API keys (user pays LLM bills).
- **Lean UI**: Translation + Settings only (no calendar/agent views).
- **Backend Power**: Cron sync, public booking API, Resend emails.
- **Privacy**: Strict `userId` scoping.
- **PWA**: Offline translation/installable.

## 🏗️ Tech Stack & Dependencies

```
Framework: Next.js 16.0 App Router, TypeScript 5, Tailwind + Shadcn
DB: Prisma 6 + Postgres (Railway)
Auth: NextAuth v5 (Prisma adapter)
AI: Anthropic SDK (Claude 3.5 Sonnet), OpenAI (Whisper-1)
Emails: Resend + React Email
APIs: Google Calendar, MS Graph
PWA: Custom manifest.json + sw.js
Hosting: Railway (web + worker services)
Build: Turborepo (optional, single app OK)
```

**npm install**:
```bash
npx create-next-app@16 work-os --ts --tailwind --app --src-dir --eslint
cd work-os
npm i prisma @prisma/client @auth/prisma-adapter next-auth@5 @anthropic-ai/sdk openai resend @resend/react-email googleapis @types/googleapis
npm i -D prisma @types/node
npx prisma init
```

## 📊 Prisma Schema (prisma/schema.prisma)

Copy Calypso schema + extensions:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// NextAuth models (from Calypso)
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id                String        @id @default(cuid())
  name              String?
  email             String?       @unique
  emailVerified      DateTime?
  image             String?
  isApproved        Boolean       @default(false)  // Admin approval
  accounts          Account[]
  sessions          Session[]
  settings          UserSettings?
  calendarConnections CalendarConnection[]
  tones             Tone[]
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// Calypso models (copy from calypso.md)
model CalendarConnection {  // etc. full from file:1
  // ... (sourceType, color, syncMode, userId: String, user: User @relation...)
}

model EventMapping { /* ... */ }
model UserSettings {
  id                      String   @id @default(cuid())
  userId                  String   @unique
  user                    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  anthropicApiKey         String?
  openaiApiKey            String?
  microsoftClientId       String?
  microsoftClientSecret   String?
  syncInterval            Int      @default(15)  // minutes
  tones                   Tone[]
}

// New: Tones (ex-Notion)
model Tone {
  id          String   @id @default(cuid())
  userId      String
  name        String   // "Formal"
  instructions String  // "Professional tone..."
  updatedAt   DateTime @updatedAt
  settings    UserSettings @relation(fields: [userId], references: [userId], onDelete: Cascade)
}
```

**Migrations**: `npx prisma migrate dev --name init`, `db push` for prod.

## 🔐 Authentication (src/auth.ts)

```ts
// src/auth.ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google({ /* clientId/secret from env */ })],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.isApproved = user.isApproved
      return token
    },
    session: ({ session, token }) => {
      session.user.isApproved = token.isApproved as boolean
      return session
    }
  },
  pages: { signIn: '/auth/signin' }
})
```

**Middleware** (middleware.ts):
```ts
import { auth } from './auth'
export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session?.user
  if (isLoggedIn && nextUrl.pathname.startsWith('/approval-pending')) nextUrl.pathname = '/'
  if (!isLoggedIn && !nextUrl.pathname.startsWith('/auth')) nextUrl.pathname = '/auth/signin'
  if (isLoggedIn && !session.user.isApproved && !nextUrl.pathname.includes('approval-pending')) {
    nextUrl.pathname = '/approval-pending'
  }
})
```

## 📧 Resend Emails (emails/ & lib/resend.ts)

**Deps**: `npm i resend @resend/react-email @react-email/components`

**lib/resend.ts**:
```ts
import { Resend } from 'resend'
import ApprovalPending from '@/emails/ApprovalPending'
import Welcome from '@/emails/Welcome'
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendApprovalEmail(userEmail: string, name?: string) {
  await resend.emails.send({
    from: 'Work OS <support@fafo-studio.com>',
    to: [userEmail],
    subject: 'Work OS - Approval Pending',
    react: ApprovalPending({ name, support: 'support@fafo-studio.com' })
  })
}
```

**emails/ApprovalPending.tsx** (React Email):
```tsx
import { Html, Button, Text } from '@react-email/components'
export default function ApprovalPending({ name, support }: {name?: string, support: string}) {
  return (
    <Html>
      <Text>Hi {name},</Text>
      <Text>Your Work OS account is pending approval. Reply to {support}.</Text>
      <Button href="https://work-os.fafo-studio.com">Check Status</Button>
    </Html>
  )
}
```

**Trigger**: NextAuth `signUp` callback → `sendApprovalEmail(user.email, user.name)`.

## 🎤 Translation Feature (/translation/page.tsx)

**UI**: Textarea + mic → Whisper → Claude → output (copy/speak).

**API Routes**:
```ts
// app/api/transcribe/route.ts
import OpenAI from 'openai'
export async function POST(req: Request, { user }: AuthContext) {
  const formData = await req.formData()
  const file = formData.get('audio') as File
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } })
  const openai = new OpenAI({ apiKey: settings?.openaiApiKey })
  const transcription = await openai.audio.transcriptions.create({ file, model: 'whisper-1' })
  return json({ text: transcription.text })
}

// app/api/translate/route.ts (POST: {input, lang, format, toneId})
// Use user.anthropicApiKey → Claude.messages w/ tools/system prompt
```

## 📅 Calendar Sync (lib/)

Copy Calypso `lib/google.ts`, `microsoft.ts`, `sync-engine.ts`. **Scope**: `where: { userId }`.

**Worker** (app/api/worker/route.ts or separate service):
```ts
// cron: every 15min
const users = await prisma.user.findMany({ where: { isApproved: true }, include: { settings: true } })
for (const user of users) {
  await syncUserCalendars(user.id)  // their connections/tokens
}
```

**Public API**: `/api/public/availability` (global? or ?userId).

## ⚙️ Settings (/settings/page.tsx)

Tabs: API Keys | Calendar | Tones.
- Keys: Form → `prisma.userSettings.upsert({ where: { userId }, update: data })`.
- Tones: `prisma.tone.upsert()`.

## PWA (public/)

**manifest.json**:
```json
{
  "name": "Work OS",
  "short_name": "WorkOS",
  "scope": "https://work-os.fafo-studio.com",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#0ea5e9"
}
```
**sw.js**: Cache-first static, network API.

## 🚀 Railway Deploy

**railway.json**:
```json
{
  "buildCommand": "prisma generate && prisma migrate deploy && next build",
  "outputDirectory": ".next"
}
```

**Procfile** (worker):
```
web: npm start
worker: npm run worker  # node-cron
```

**Env** (Railway):
```
DATABASE_URL  // Postgres service
NEXTAUTH_URL=https://work-os.fafo-studio.com
NEXTAUTH_SECRET=...
RESEND_API_KEY=...
GOOGLECLIENTID=...  // Shared
```

**Custom Domain**: Railway dashboard → add work-os.fafo-studio.com.

## 🧪 Test Checklist
- [ ] Signup → approval email → approve DB → access.
- [ ] Per-user keys → translation works.
- [ ] Multi-user: Isolation verified.
- [ ] PWA install, offline translate.
- [ ] Cron sync (logs).

**Build Order**: Auth → Emails → Translation → Sync → Settings → PWA.

**Total Est.**: 4-6 hours with Claude Code. Start with `npx prisma db push` + auth.[1][2][3][4]
