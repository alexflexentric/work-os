import { prisma } from "@/lib/db";
import { getCalendarClient } from "@/lib/google";
import { getMicrosoftBusyIntervals } from "@/lib/microsoft";

export type BusyInterval = { start: number; end: number };

// ─── User lookup ──────────────────────────────────────────────────────────────

export async function getSingleUserId(): Promise<string> {
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "desc" } });
  if (!user) throw new Error("No user found");
  return user.id;
}

// ─── Freebusy ─────────────────────────────────────────────────────────────────

export async function getBusyIntervals(
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<BusyInterval[]> {
  const connections = await prisma.calendarConnection.findMany({
    where: { userId, isActive: true },
    select: { targetGoogleCalendarId: true },
  });

  const calendarIds = [
    "primary",
    ...connections
      .filter((c) => c.targetGoogleCalendarId)
      .map((c) => c.targetGoogleCalendarId!),
  ];

  const cal = await getCalendarClient(userId);
  const [freebusyRes, msBusy] = await Promise.all([
    cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    }),
    getMicrosoftBusyIntervals(userId, timeMin, timeMax).catch(() => []),
  ]);

  const busyRaw: BusyInterval[] = [];
  for (const calData of Object.values(freebusyRes.data.calendars ?? {})) {
    for (const busy of calData.busy ?? []) {
      if (busy.start && busy.end) {
        busyRaw.push({
          start: new Date(busy.start).getTime(),
          end: new Date(busy.end).getTime(),
        });
      }
    }
  }

  return mergeBusyIntervals([...busyRaw, ...msBusy]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

// Convert a bare local datetime string (no TZ suffix) to UTC ISO.
// Uses the reliable sv-locale two-pass trick. Already-zoned strings pass through.
export function localToUtcIso(dtStr: string, timezone: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(dtStr)) return dtStr;
  const approx = new Date(dtStr + "Z");
  try {
    const localStr = approx.toLocaleString("sv", { timeZone: timezone });
    const offsetMs =
      new Date(localStr.replace(" ", "T") + "Z").getTime() - approx.getTime();
    const corrected = new Date(approx.getTime() - offsetMs);
    const localStr2 = corrected.toLocaleString("sv", { timeZone: timezone });
    const offsetMs2 =
      new Date(localStr2.replace(" ", "T") + "Z").getTime() -
      corrected.getTime();
    return new Date(approx.getTime() - offsetMs2).toISOString();
  } catch {
    return dtStr + "Z";
  }
}

// Convert a UTC Date to a local ISO string ("YYYY-MM-DDTHH:mm:ss").
export function toLocalIso(date: Date, timezone: string): string {
  return date.toLocaleString("sv", { timeZone: timezone }).replace(" ", "T");
}

export function getLocalHour(date: Date, timezone: string): number {
  const str = date.toLocaleString("sv", { timeZone: timezone });
  return parseInt(str.split(" ")[1].split(":")[0], 10);
}

export function getLocalHourDecimal(date: Date, timezone: string): number {
  const str = date.toLocaleString("sv", { timeZone: timezone });
  const [h, m] = str.split(" ")[1].split(":").map(Number);
  return h + m / 60;
}

export function isWeekend(date: Date, timezone: string): boolean {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return day === "Sat" || day === "Sun";
}

// Return the UTC timestamp for 09:00 local on the day after `cursor`.
export function nextWorkingDayNineAm(cursor: number, timezone: string): number {
  return nextDayAtTime(cursor, timezone, "09:00");
}

// Return the UTC timestamp for 09:00 local on the same day as `cursor`.
export function thisDayNineAm(cursor: number, timezone: string): number {
  return thisDayAtTime(cursor, timezone, "09:00");
}

// Return local day-of-week for a UTC Date in the given timezone (0=Sun..6=Sat).
export function getLocalDayOfWeek(date: Date, timezone: string): number {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

// Return UTC timestamp for HH:MM local on the same calendar day as `cursor`.
export function thisDayAtTime(cursor: number, timezone: string, hhmm: string): number {
  const localStr = new Date(cursor).toLocaleString("sv", { timeZone: timezone });
  const datePart = localStr.split(" ")[0];
  return new Date(localToUtcIso(`${datePart}T${hhmm}:00`, timezone)).getTime();
}

// Return UTC timestamp for HH:MM local on the next calendar day after `cursor`.
export function nextDayAtTime(cursor: number, timezone: string, hhmm: string): number {
  const localStr = new Date(cursor).toLocaleString("sv", { timeZone: timezone });
  const datePart = localStr.split(" ")[0];
  const [y, mo, d] = datePart.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextDatePart = next.toISOString().split("T")[0];
  return new Date(localToUtcIso(`${nextDatePart}T${hhmm}:00`, timezone)).getTime();
}
