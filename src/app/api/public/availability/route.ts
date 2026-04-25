import { type NextRequest, NextResponse } from "next/server";
import { guardPublicApi, corsHeaders } from "@/lib/public-api-guard";
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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const guard = guardPublicApi(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "14", 10), 1), 60);
  const duration = parseInt(searchParams.get("duration") ?? "30", 10);

  if (!VALID_DURATIONS.has(duration)) {
    return NextResponse.json(
      { error: "Invalid duration. Accepted: 15, 30, 60, 90, 120" },
      { status: 400, headers: corsHeaders() }
    );
  }

  if (!slug) {
    return NextResponse.json(
      { error: "slug is required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  try {
    const bookingPage = await prisma.bookingPage.findUnique({
      where: { slug },
      select: { id: true, userId: true, schedule: true, timezone: true, calendarSources: true },
    });

    if (!bookingPage) {
      return NextResponse.json({ error: "Booking page not found" }, { status: 404, headers: corsHeaders() });
    }

    const { userId, timezone, calendarSources } = bookingPage;
    const schedule = (bookingPage.schedule as WeeklySchedule | null) ?? DEFAULT_SCHEDULE;

    const now = new Date();
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const timeMin = now.toISOString();
    const timeMax = windowEnd.toISOString();

    // Busy from master calendar (MS Graph or Google)
    const masterBusy = calendarSources.includes("master")
      ? await getBusyIntervals(userId, timeMin, timeMax).catch(() => [] as BusyInterval[])
      : [];

    // Busy from iCal connections (from CalendarEvent cache)
    const icalSourceIds = calendarSources.filter((s) => s !== "master");
    const icalBusy: BusyInterval[] =
      icalSourceIds.length > 0
        ? (
            await prisma.calendarEvent.findMany({
              where: {
                userId,
                source: { in: icalSourceIds },
                startAt: { lt: windowEnd },
                endAt: { gt: now },
              },
              select: { startAt: true, endAt: true },
            })
          ).map((e) => ({ start: e.startAt.getTime(), end: e.endAt.getTime() }))
        : [];

    // Busy from existing bookings for this booking page
    const existingBookings = await prisma.booking.findMany({
      where: {
        bookingPageId: bookingPage.id,
        status: { not: "declined" },
        startAt: { lt: windowEnd },
        endAt: { gt: now },
      },
      select: { startAt: true, endAt: true },
    });
    const bookingBusy: BusyInterval[] = existingBookings.map((b) => ({
      start: b.startAt.getTime(),
      end: b.endAt.getTime(),
    }));

    const busy = mergeBusyIntervals([...masterBusy, ...icalBusy, ...bookingBusy]);

    const durationMs = duration * 60 * 1000;
    const slots: Array<{ start: string; end: string }> = [];

    let cursor = Math.ceil(now.getTime() / SLOT_BOUNDARY_MS) * SLOT_BOUNDARY_MS;

    while (cursor < windowEnd.getTime()) {
      const startDate = new Date(cursor);
      const dow = getLocalDayOfWeek(startDate, timezone);
      const daySchedule = schedule[dow];

      if (daySchedule.unavailable) {
        cursor = nextDayAtTime(cursor, timezone, "00:00");
        continue;
      }

      const startDecimal = parseHHMM(daySchedule.start);
      const endDecimal = parseHHMM(daySchedule.end);
      const hourDecimal = getLocalHourDecimal(startDate, timezone);

      if (hourDecimal < startDecimal) {
        const dayStart = thisDayAtTime(cursor, timezone, daySchedule.start);
        cursor = dayStart > cursor ? dayStart : cursor + SLOT_BOUNDARY_MS;
        continue;
      }

      if (hourDecimal >= endDecimal) {
        cursor = nextDayAtTime(cursor, timezone, "00:00");
        continue;
      }

      const slotEnd = cursor + durationMs;
      const slotEndDecimal = getLocalHourDecimal(new Date(slotEnd), timezone);

      if (slotEndDecimal > endDecimal) {
        cursor = nextDayAtTime(cursor, timezone, "00:00");
        continue;
      }

      const blocking = busy.find((b) => cursor < b.end && slotEnd > b.start);
      if (!blocking) {
        slots.push({
          start: toLocalIso(startDate, timezone),
          end: toLocalIso(new Date(slotEnd), timezone),
        });
        cursor = slotEnd;
      } else {
        cursor = Math.ceil(blocking.end / SLOT_BOUNDARY_MS) * SLOT_BOUNDARY_MS;
      }
    }

    return NextResponse.json({ slots, timezone }, { headers: corsHeaders() });
  } catch (err) {
    console.error("[availability] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
