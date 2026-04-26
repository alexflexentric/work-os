import { auth } from "@/auth";
import { type NextRequest, NextResponse } from "next/server";
import {
  getBusyIntervals,
  getLocalHourDecimal,
  getLocalDayOfWeek,
  toLocalIso,
  thisDayAtTime,
  nextDayAtTime,
  mergeBusyIntervals,
  type BusyInterval,
} from "@/lib/freebusy";
import { prisma } from "@/lib/db";
import { DEFAULT_SCHEDULE, parseHHMM, type WeeklySchedule } from "@/lib/availability-schedule";

const VALID_DURATIONS = new Set([15, 30, 60, 90, 120]);
const SLOT_BOUNDARY_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "14", 10), 1), 60);
  const duration = parseInt(searchParams.get("duration") ?? "30", 10);

  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  if (!VALID_DURATIONS.has(duration)) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }

  const bookingPage = await prisma.bookingPage.findUnique({
    where: { slug },
    select: { id: true, userId: true, schedule: true, timezone: true, calendarSources: true },
  });
  if (!bookingPage) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { userId, timezone, calendarSources } = bookingPage;
  const schedule = (bookingPage.schedule as WeeklySchedule | null) ?? DEFAULT_SCHEDULE;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Live MS Graph / Google call for the master calendar (fresh data)
  const masterBusy = calendarSources.includes("master")
    ? await getBusyIntervals(userId, now.toISOString(), windowEnd.toISOString()).catch(() => [] as BusyInterval[])
    : [];

  // CalendarEvent cache for all configured sources (master + iCal).
  // Ensures whatever is visible in the calendar view also blocks slots —
  // catches cases where the live MS Graph call silently fails or misses an instance.
  const cachedBusy: BusyInterval[] = calendarSources.length > 0
    ? (
        await prisma.calendarEvent.findMany({
          where: { userId, source: { in: calendarSources }, startAt: { lt: windowEnd }, endAt: { gt: now } },
          select: { startAt: true, endAt: true },
        })
      ).map((e) => ({ start: e.startAt.getTime(), end: e.endAt.getTime() }))
    : [];

  const bookingBusy: BusyInterval[] = (
    await prisma.booking.findMany({
      where: { bookingPageId: bookingPage.id, status: { not: "declined" }, startAt: { lt: windowEnd }, endAt: { gt: now } },
      select: { startAt: true, endAt: true },
    })
  ).map((b) => ({ start: b.startAt.getTime(), end: b.endAt.getTime() }));

  const busy = mergeBusyIntervals([...masterBusy, ...cachedBusy, ...bookingBusy]);
  const durationMs = duration * 60 * 1000;
  const slots: Array<{ start: string; end: string }> = [];

  let cursor = Math.ceil(now.getTime() / SLOT_BOUNDARY_MS) * SLOT_BOUNDARY_MS;

  while (cursor < windowEnd.getTime()) {
    const startDate = new Date(cursor);
    const dow = getLocalDayOfWeek(startDate, timezone);
    const daySchedule = schedule[dow];

    if (daySchedule.unavailable) { cursor = nextDayAtTime(cursor, timezone, "00:00"); continue; }

    const startDecimal = parseHHMM(daySchedule.start);
    const endDecimal = parseHHMM(daySchedule.end);
    const hourDecimal = getLocalHourDecimal(startDate, timezone);

    if (hourDecimal < startDecimal) {
      const dayStart = thisDayAtTime(cursor, timezone, daySchedule.start);
      cursor = dayStart > cursor ? dayStart : cursor + SLOT_BOUNDARY_MS;
      continue;
    }
    if (hourDecimal >= endDecimal) { cursor = nextDayAtTime(cursor, timezone, "00:00"); continue; }

    const slotEnd = cursor + durationMs;
    if (getLocalHourDecimal(new Date(slotEnd), timezone) > endDecimal) {
      cursor = nextDayAtTime(cursor, timezone, "00:00"); continue;
    }

    const blocking = busy.find((b) => cursor < b.end && slotEnd > b.start);
    if (!blocking) {
      slots.push({ start: toLocalIso(startDate, timezone), end: toLocalIso(new Date(slotEnd), timezone) });
      cursor = slotEnd;
    } else {
      cursor = Math.ceil(blocking.end / SLOT_BOUNDARY_MS) * SLOT_BOUNDARY_MS;
    }
  }

  return NextResponse.json({ slots, timezone });
}
