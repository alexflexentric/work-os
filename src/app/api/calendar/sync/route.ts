import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse, type NextRequest } from "next/server";
import { listMicrosoftCalendarView } from "@/lib/microsoft";
import { listGoogleEventsInRange } from "@/lib/google";
import { fetchAndParseIcal } from "@/lib/ical";

const DAYS_BACK = 30;
const DAYS_AHEAD = 120;

async function syncUser(userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - DAYS_BACK * 86_400_000);
  const windowEnd = new Date(Date.now() + DAYS_AHEAD * 86_400_000);
  let synced = 0;

  // ── Master calendar ───────────────────────────────────────────────────────────
  const msAccount = await prisma.account.findFirst({
    where: { userId, provider: { in: ["microsoft-entra-id", "microsoft"] } },
  });

  if (msAccount) {
    try {
      const events = await listMicrosoftCalendarView(
        userId,
        windowStart.toISOString(),
        windowEnd.toISOString()
      );
      const currentIds = new Set(events.map((e) => e.id));

      for (const ev of events) {
        const isAllDay = ev.isAllDay ?? false;
        const startAt = isAllDay
          ? new Date(ev.start.dateTime.slice(0, 10) + "T00:00:00Z")
          : new Date(ev.start.dateTime + (ev.start.dateTime.endsWith("Z") ? "" : "Z"));
        const endAt = isAllDay
          ? new Date(ev.end.dateTime.slice(0, 10) + "T00:00:00Z")
          : new Date(ev.end.dateTime + (ev.end.dateTime.endsWith("Z") ? "" : "Z"));

        await prisma.calendarEvent.upsert({
          where: { userId_source_externalId: { userId, source: "master", externalId: ev.id } },
          create: { userId, source: "master", externalId: ev.id, title: ev.subject ?? "(No title)", startAt, endAt, allDay: isAllDay, location: ev.location?.displayName ?? null },
          update: { title: ev.subject ?? "(No title)", startAt, endAt, allDay: isAllDay, location: ev.location?.displayName ?? null },
        });
        synced++;
      }

      await prisma.calendarEvent.deleteMany({
        where: {
          userId, source: "master",
          startAt: { gte: windowStart, lte: windowEnd },
          externalId: { notIn: [...currentIds] },
        },
      });
    } catch (err) {
      console.error("[calendar/sync] MS master error:", err);
    }
  } else {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { userId } });
      const calendarId = settings?.calendarId ?? "primary";
      const events = await listGoogleEventsInRange(
        userId,
        calendarId,
        windowStart.toISOString(),
        windowEnd.toISOString()
      );
      const currentIds = new Set(
        events.filter((e) => e.id && e.status !== "cancelled").map((e) => e.id!)
      );

      for (const ev of events) {
        if (!ev.id || ev.status === "cancelled") continue;
        const allDay = !ev.start?.dateTime;
        const startAt = allDay
          ? new Date(ev.start!.date! + "T00:00:00Z")
          : new Date(ev.start!.dateTime!);
        const endAt = allDay
          ? new Date(ev.end!.date! + "T00:00:00Z")
          : new Date(ev.end!.dateTime!);

        await prisma.calendarEvent.upsert({
          where: { userId_source_externalId: { userId, source: "master", externalId: ev.id } },
          create: { userId, source: "master", externalId: ev.id, title: ev.summary ?? "(No title)", startAt, endAt, allDay, location: ev.location ?? null },
          update: { title: ev.summary ?? "(No title)", startAt, endAt, allDay, location: ev.location ?? null },
        });
        synced++;
      }

      await prisma.calendarEvent.deleteMany({
        where: {
          userId, source: "master",
          startAt: { gte: windowStart, lte: windowEnd },
          externalId: { notIn: [...currentIds] },
        },
      });
    } catch (err) {
      console.error("[calendar/sync] Google master error:", err);
    }
  }

  // ── iCal connections ──────────────────────────────────────────────────────────
  const connections = await prisma.calendarConnection.findMany({
    where: { userId, isActive: true, icalUrl: { not: null } },
  });

  for (const conn of connections) {
    if (!conn.icalUrl) continue;
    try {
      const windowStart2 = new Date(Date.now() - DAYS_BACK * 86_400_000);
      const windowEnd2 = new Date(Date.now() + DAYS_AHEAD * 86_400_000);
      const icalEvents = await fetchAndParseIcal(conn.icalUrl, windowStart2, windowEnd2);
      const inWindow = icalEvents.filter((e) => e.status !== "cancelled");
      const currentIds = new Set(inWindow.map((e) => e.uid));

      for (const ev of inWindow) {
        await prisma.calendarEvent.upsert({
          where: { userId_source_externalId: { userId, source: conn.id, externalId: ev.uid } },
          create: { userId, source: conn.id, externalId: ev.uid, title: ev.summary, startAt: ev.start, endAt: ev.end, allDay: ev.allDay, location: ev.location ?? null },
          update: { title: ev.summary, startAt: ev.start, endAt: ev.end, allDay: ev.allDay, location: ev.location ?? null },
        });
        synced++;
      }

      await prisma.calendarEvent.deleteMany({
        where: {
          userId, source: conn.id,
          startAt: { gte: windowStart2, lte: windowEnd2 },
          externalId: { notIn: [...currentIds] },
        },
      });
    } catch (err) {
      console.error(`[calendar/sync] iCal error for ${conn.id}:`, err);
    }
  }

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, calendarSyncedAt: new Date() },
    update: { calendarSyncedAt: new Date() },
  });

  return synced;
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  // Cron path: called with CRON_SECRET, syncs all approved users
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const users = await prisma.user.findMany({
      where: { isApproved: true },
      select: { id: true },
    });
    let totalSynced = 0;
    for (const user of users) {
      try {
        totalSynced += await syncUser(user.id);
      } catch (err) {
        console.error(`[calendar/sync] cron error for user ${user.id}:`, err);
      }
    }
    console.log(`[calendar/sync] cron: synced ${totalSynced} events across ${users.length} users`);
    return NextResponse.json({ synced: totalSynced, users: users.length });
  }

  // Session path: called from the UI, syncs only the logged-in user
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const synced = await syncUser(session.userId);
  return NextResponse.json({ synced });
}
