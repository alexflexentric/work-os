import { type NextRequest, NextResponse } from "next/server";
import { guardPublicApi, corsHeaders } from "@/lib/public-api-guard";
import {
  getSingleUserId,
  getBusyIntervals,
  getLocalHourDecimal,
  getLocalDayOfWeek,
  toLocalIso,
  thisDayAtTime,
  nextDayAtTime,
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
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "14", 10), 1), 60);
  const duration = parseInt(searchParams.get("duration") ?? "30", 10);

  if (!VALID_DURATIONS.has(duration)) {
    return NextResponse.json(
      { error: "Invalid duration. Accepted: 15, 30, 60, 90, 120" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const timezone = process.env.USER_TIMEZONE ?? "UTC";

  try {
    const userId = await getSingleUserId();

    const now = new Date();
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const [busy, settings] = await Promise.all([
      getBusyIntervals(userId, now.toISOString(), windowEnd.toISOString()),
      prisma.userSettings.findUnique({
        where: { userId },
        select: { availabilitySchedule: true },
      }),
    ]);

    const schedule =
      (settings?.availabilitySchedule as WeeklySchedule | null) ?? DEFAULT_SCHEDULE;

    const durationMs = duration * 60 * 1000;
    const slots: Array<{ start: string; end: string }> = [];

    // Start at next 30-min boundary from now
    let cursor = Math.ceil(now.getTime() / SLOT_BOUNDARY_MS) * SLOT_BOUNDARY_MS;

    while (cursor < windowEnd.getTime()) {
      const startDate = new Date(cursor);
      const dow = getLocalDayOfWeek(startDate, timezone); // 0=Sun..6=Sat
      const daySchedule = schedule[dow];

      // Unavailable day — jump to midnight of next day, loop re-evaluates that day
      if (daySchedule.unavailable) {
        cursor = nextDayAtTime(cursor, timezone, "00:00");
        continue;
      }

      const startDecimal = parseHHMM(daySchedule.start);
      const endDecimal = parseHHMM(daySchedule.end);
      const hourDecimal = getLocalHourDecimal(startDate, timezone);

      // Before working hours — jump to day's start time
      if (hourDecimal < startDecimal) {
        const dayStart = thisDayAtTime(cursor, timezone, daySchedule.start);
        cursor = dayStart > cursor ? dayStart : cursor + SLOT_BOUNDARY_MS;
        continue;
      }

      // At or past end of working hours — jump to midnight of next day
      if (hourDecimal >= endDecimal) {
        cursor = nextDayAtTime(cursor, timezone, "00:00");
        continue;
      }

      const slotEnd = cursor + durationMs;
      const slotEndDecimal = getLocalHourDecimal(new Date(slotEnd), timezone);

      // Slot would run past end of working hours — skip to next day
      if (slotEndDecimal > endDecimal) {
        cursor = nextDayAtTime(cursor, timezone, "00:00");
        continue;
      }

      // Check against busy intervals
      const blocking = busy.find((b) => cursor < b.end && slotEnd > b.start);
      if (!blocking) {
        slots.push({
          start: toLocalIso(startDate, timezone),
          end: toLocalIso(new Date(slotEnd), timezone),
        });
        cursor = slotEnd;
      } else {
        // Round up past the busy interval to the next 30-min mark
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
