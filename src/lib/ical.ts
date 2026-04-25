import { calendar_v3 } from "googleapis";

// Windows timezone name → IANA name (Outlook/MS iCal feeds use Windows names)
const WINDOWS_TO_IANA: Record<string, string> = {
  "Romance Standard Time": "Europe/Paris",
  "Central European Standard Time": "Europe/Warsaw",
  "W. Europe Standard Time": "Europe/Berlin",
  "E. Europe Standard Time": "Asia/Nicosia",
  "FLE Standard Time": "Europe/Helsinki",
  "GTB Standard Time": "Europe/Bucharest",
  "Turkey Standard Time": "Europe/Istanbul",
  "Russia Time Zone 3": "Europe/Samara",
  "Russian Standard Time": "Europe/Moscow",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "US Eastern Standard Time": "America/Indianapolis",
  "US Mountain Standard Time": "America/Phoenix",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "Canada Central Standard Time": "America/Regina",
  "SA Pacific Standard Time": "America/Bogota",
  "SA Western Standard Time": "America/La_Paz",
  "SA Eastern Standard Time": "America/Cayenne",
  "Argentina Standard Time": "America/Buenos_Aires",
  "E. South America Standard Time": "America/Sao_Paulo",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "Singapore Standard Time": "Asia/Singapore",
  "India Standard Time": "Asia/Calcutta",
  "SE Asia Standard Time": "Asia/Bangkok",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "E. Australia Standard Time": "Australia/Brisbane",
  "New Zealand Standard Time": "Pacific/Auckland",
  "UTC": "UTC",
};

function normalizeTimezone(tzid: string): string {
  return WINDOWS_TO_IANA[tzid] ?? tzid;
}

export interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone?: string;
  lastModified?: Date;
  status?: string;
  recurrenceRule?: string;
}

function localToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tzid: string): Date {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const approx = new Date(`${pad(y, 4)}-${pad(mo + 1)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}Z`);
  try {
    const localStr = approx.toLocaleString("sv", { timeZone: tzid });
    const localAsUtc = new Date(localStr.replace(" ", "T") + "Z");
    const offsetMs = localAsUtc.getTime() - approx.getTime();
    const corrected = new Date(approx.getTime() - offsetMs);
    const localStr2 = corrected.toLocaleString("sv", { timeZone: tzid });
    const localAsUtc2 = new Date(localStr2.replace(" ", "T") + "Z");
    const offsetMs2 = localAsUtc2.getTime() - corrected.getTime();
    return new Date(approx.getTime() - offsetMs2);
  } catch {
    return approx;
  }
}

function parseICalDate(value: string, tzid?: string): { date: Date; allDay: boolean } {
  if (/^\d{8}$/.test(value)) {
    const year = parseInt(value.slice(0, 4));
    const month = parseInt(value.slice(4, 6)) - 1;
    const day = parseInt(value.slice(6, 8));
    return { date: new Date(Date.UTC(year, month, day)), allDay: true };
  }
  if (value.endsWith("Z")) {
    const iso = value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*Z/, "$1-$2-$3T$4:$5:$6Z");
    return { date: new Date(iso), allDay: false };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (m && tzid) {
    const [, y, mo, d, h, mi, s] = m.map(Number);
    return { date: localToUtc(y, mo - 1, d, h, mi, s, normalizeTimezone(tzid)), allDay: false };
  }
  const iso = value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6") + "Z";
  return { date: new Date(iso), allDay: false };
}

function parsePropLine(line: string): { key: string; params: Record<string, string>; value: string } {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return { key: line, params: {}, value: "" };

  const keyPart = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = keyPart.split(";");
  const key = parts[0].toUpperCase();
  const params: Record<string, string> = {};

  for (const part of parts.slice(1)) {
    const eqIdx = part.indexOf("=");
    if (eqIdx !== -1) {
      params[part.slice(0, eqIdx).toUpperCase()] = part.slice(eqIdx + 1);
    }
  }

  return { key, params, value };
}

function unfoldLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((l) => l.length > 0);
}

function unescapeValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDuration(value: string): number {
  let ms = 0;
  const weekMatch = value.match(/(\d+)W/);
  const dayMatch = value.match(/(\d+)D/);
  const hourMatch = value.match(/(\d+)H/);
  const minMatch = value.match(/(\d+)M/);
  const secMatch = value.match(/(\d+)S/);

  if (weekMatch) ms += parseInt(weekMatch[1]) * 7 * 24 * 3600 * 1000;
  if (dayMatch) ms += parseInt(dayMatch[1]) * 24 * 3600 * 1000;
  if (hourMatch) ms += parseInt(hourMatch[1]) * 3600 * 1000;
  if (minMatch) ms += parseInt(minMatch[1]) * 60 * 1000;
  if (secMatch) ms += parseInt(secMatch[1]) * 1000;

  return ms;
}

// ─── RRULE expansion ──────────────────────────────────────────────────────────

const ICAL_DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function parseRRule(str: string): {
  freq: string;
  interval: number;
  until: Date | null;
  count: number | null;
  byDay: number[] | null;
  byMonthDay: number[] | null;
} {
  const raw = str.startsWith("RRULE:") ? str.slice(6) : str;
  const params: Record<string, string> = {};
  for (const seg of raw.split(";")) {
    const eq = seg.indexOf("=");
    if (eq > 0) params[seg.slice(0, eq)] = seg.slice(eq + 1);
  }
  return {
    freq: params.FREQ ?? "DAILY",
    interval: parseInt(params.INTERVAL ?? "1") || 1,
    until: params.UNTIL ? parseICalDate(params.UNTIL).date : null,
    count: params.COUNT ? parseInt(params.COUNT) : null,
    byDay: params.BYDAY
      ? params.BYDAY.split(",")
          .map((s) => {
            const m = s.match(/(SU|MO|TU|WE|TH|FR|SA)$/);
            return m ? ICAL_DAY_MAP[m[1]] : -1;
          })
          .filter((d) => d >= 0)
      : null,
    byMonthDay: params.BYMONTHDAY
      ? params.BYMONTHDAY.split(",").map(Number).filter((n) => !isNaN(n))
      : null,
  };
}

function addUTCDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

// Expand an RRULE into occurrence start times within [windowStart, windowEnd].
// dtstart must be UTC. Returns dates in UTC.
function expandRRule(
  dtstart: Date,
  rruleStr: string,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const { freq, interval, until, count, byDay, byMonthDay } = parseRRule(rruleStr);
  const ceiling = until && until < windowEnd ? until : windowEnd;
  const instances: Date[] = [];
  const MAX = 2000;

  if (freq === "DAILY") {
    let cur = new Date(dtstart);
    // Jump ahead to near windowStart for performance (only safe without COUNT)
    if (!count && !byDay && windowStart > cur) {
      const skip = Math.max(0, Math.floor((windowStart.getTime() - cur.getTime()) / (interval * 86_400_000)) - 1);
      cur = addUTCDays(cur, skip * interval);
    }
    while (cur <= ceiling && instances.length < MAX) {
      if ((!byDay || byDay.includes(cur.getUTCDay())) && cur >= windowStart && cur >= dtstart) {
        instances.push(new Date(cur));
      }
      if (count !== null && instances.length >= count) break;
      cur = addUTCDays(cur, byDay ? 1 : interval);
    }
  } else if (freq === "WEEKLY") {
    const days = byDay ?? [dtstart.getUTCDay()];
    const wkstDay = 1; // Monday (RFC 5545 default)
    const daysToWkst = (dtstart.getUTCDay() - wkstDay + 7) % 7;
    let weekStart = addUTCDays(dtstart, -daysToWkst);

    // Jump ahead to near windowStart for performance (only safe without COUNT)
    if (!count && windowStart > weekStart) {
      const weeksAhead = Math.max(
        0,
        Math.floor((windowStart.getTime() - weekStart.getTime()) / (7 * 86_400_000 * interval)) - 1
      );
      weekStart = addUTCDays(weekStart, weeksAhead * 7 * interval);
    }

    while (weekStart <= ceiling && instances.length < MAX) {
      for (const d of days) {
        const daysFromWkst = (d - wkstDay + 7) % 7;
        const candidate = addUTCDays(weekStart, daysFromWkst);
        if (candidate >= dtstart && candidate <= ceiling && candidate >= windowStart) {
          instances.push(new Date(candidate));
        }
        if (count !== null && instances.length >= count) break;
      }
      if (count !== null && instances.length >= count) break;
      weekStart = addUTCDays(weekStart, 7 * interval);
    }
    instances.sort((a, b) => a.getTime() - b.getTime());
  } else if (freq === "MONTHLY") {
    let year = dtstart.getUTCFullYear();
    let month = dtstart.getUTCMonth();
    const h = dtstart.getUTCHours();
    const mi = dtstart.getUTCMinutes();
    const s = dtstart.getUTCSeconds();

    while (instances.length < MAX) {
      if (new Date(Date.UTC(year, month, 1)) > ceiling) break;
      const targetDays = byMonthDay ?? [dtstart.getUTCDate()];
      for (const day of targetDays) {
        const c = new Date(Date.UTC(year, month, day, h, mi, s));
        // Skip if date overflowed to next month (e.g. Feb 31)
        if (c.getUTCMonth() !== ((month % 12 + 12) % 12)) continue;
        if (c >= dtstart && c <= ceiling && c >= windowStart) {
          instances.push(c);
        }
        if (count !== null && instances.length >= count) break;
      }
      if (count !== null && instances.length >= count) break;
      month += interval;
      if (month >= 12) {
        year += Math.floor(month / 12);
        month = month % 12;
      }
    }
    instances.sort((a, b) => a.getTime() - b.getTime());
  } else if (freq === "YEARLY") {
    let year = dtstart.getUTCFullYear();
    while (instances.length < MAX) {
      const c = new Date(
        Date.UTC(year, dtstart.getUTCMonth(), dtstart.getUTCDate(),
          dtstart.getUTCHours(), dtstart.getUTCMinutes(), dtstart.getUTCSeconds())
      );
      if (c > ceiling) break;
      if (c >= dtstart && c >= windowStart) {
        instances.push(c);
        if (count !== null && instances.length >= count) break;
      }
      year += interval;
    }
  }

  return instances;
}

// ─── Raw VEVENT type (internal) ───────────────────────────────────────────────

interface RawVEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone?: string;
  lastModified?: Date;
  status?: string;
  rrule?: string;
  exdates: Date[];
  recurrenceId?: Date;
}

function parseRawVEvents(lines: string[]): RawVEvent[] {
  const events: RawVEvent[] = [];
  let inEvent = false;
  let current: Partial<RawVEvent> & { exdates: Date[] } = { exdates: [] };
  let allDay = false;
  let eventTimezone: string | undefined;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = { exdates: [] };
      allDay = false;
      eventTimezone = undefined;
      continue;
    }

    if (line === "END:VEVENT") {
      if (current.uid && current.start && current.end) {
        events.push({
          uid: current.uid,
          summary: current.summary ?? "(No title)",
          description: current.description,
          location: current.location,
          start: current.start,
          end: current.end,
          allDay,
          timezone: eventTimezone,
          lastModified: current.lastModified,
          status: current.status,
          rrule: current.rrule,
          exdates: current.exdates,
          recurrenceId: current.recurrenceId,
        });
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const { key, params, value } = parsePropLine(line);

    switch (key) {
      case "UID":
        current.uid = unescapeValue(value);
        break;
      case "SUMMARY":
        current.summary = unescapeValue(value);
        break;
      case "DESCRIPTION":
        current.description = unescapeValue(value);
        break;
      case "LOCATION":
        current.location = unescapeValue(value);
        break;
      case "DTSTART": {
        const parsed = parseICalDate(value, params.TZID);
        current.start = parsed.date;
        allDay = parsed.allDay;
        if (params.TZID) eventTimezone = normalizeTimezone(params.TZID);
        break;
      }
      case "DTEND": {
        const parsed = parseICalDate(value, params.TZID);
        current.end = parsed.date;
        break;
      }
      case "DURATION": {
        if (current.start) {
          const ms = parseDuration(value);
          current.end = new Date(current.start.getTime() + ms);
        }
        break;
      }
      case "LAST-MODIFIED":
        current.lastModified = parseICalDate(value).date;
        break;
      case "STATUS":
        current.status = value.toLowerCase();
        break;
      case "RRULE":
        current.rrule = `RRULE:${value}`;
        break;
      case "EXDATE": {
        // Comma-separated list of excluded datetimes
        const tzid = params.TZID;
        for (const raw of value.split(",")) {
          const trimmed = raw.trim();
          if (trimmed) current.exdates.push(parseICalDate(trimmed, tzid).date);
        }
        break;
      }
      case "RECURRENCE-ID": {
        current.recurrenceId = parseICalDate(value, params.TZID).date;
        break;
      }
    }
  }

  return events;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchAndParseIcal(
  url: string,
  windowStart?: Date,
  windowEnd?: Date
): Promise<ICalEvent[]> {
  const normalizedUrl = url.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(normalizedUrl, {
    headers: { "User-Agent": "Calypso/1.0 calendar-sync" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch iCal feed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  return parseIcalText(text, windowStart, windowEnd);
}

export function parseIcalText(
  text: string,
  windowStart?: Date,
  windowEnd?: Date
): ICalEvent[] {
  const lines = unfoldLines(text);
  const rawEvents = parseRawVEvents(lines);

  // Default window if not provided: 30 days back → 120 days forward
  const wStart = windowStart ?? new Date(Date.now() - 30 * 86_400_000);
  const wEnd = windowEnd ?? new Date(Date.now() + 120 * 86_400_000);

  // Group by UID: separate masters (RRULE) from exception overrides (RECURRENCE-ID)
  const masters = new Map<string, RawVEvent>();
  const exceptions = new Map<string, Map<number, RawVEvent>>(); // uid → (recurrenceId ms → event)

  for (const ev of rawEvents) {
    if (ev.recurrenceId !== undefined) {
      let exMap = exceptions.get(ev.uid);
      if (!exMap) { exMap = new Map(); exceptions.set(ev.uid, exMap); }
      exMap.set(ev.recurrenceId.getTime(), ev);
    } else if (ev.rrule) {
      masters.set(ev.uid, ev);
    } else {
      // Non-recurring: treat as master without expansion
      masters.set(ev.uid, ev);
    }
  }

  const results: ICalEvent[] = [];

  for (const [uid, master] of masters) {
    const exMap = exceptions.get(uid) ?? new Map<number, RawVEvent>();
    const exdateSet = new Set(master.exdates.map((d) => d.getTime()));

    if (master.rrule) {
      // Expand recurring series into individual instances
      const instanceStarts = expandRRule(master.start, master.rrule, wStart, wEnd);
      const duration = master.end.getTime() - master.start.getTime();

      for (const instanceStart of instanceStarts) {
        // Skip EXDATE-excluded instances
        if (exdateSet.has(instanceStart.getTime())) continue;

        const exception = exMap.get(instanceStart.getTime());
        if (exception) {
          if (exception.status === "cancelled") continue;
          results.push({
            uid: `${uid}:${instanceStart.toISOString()}`,
            summary: exception.summary,
            description: exception.description,
            location: exception.location,
            start: exception.start,
            end: exception.end,
            allDay: exception.allDay,
            timezone: exception.timezone,
            status: exception.status,
          });
        } else {
          results.push({
            uid: `${uid}:${instanceStart.toISOString()}`,
            summary: master.summary,
            description: master.description,
            location: master.location,
            start: instanceStart,
            end: new Date(instanceStart.getTime() + duration),
            allDay: master.allDay,
            timezone: master.timezone,
            status: master.status,
          });
        }
      }

      // Also include exception events whose recurrenceId falls outside the expanded
      // window (e.g. moved instances) but whose actual start is within the window
      for (const [, exc] of exMap) {
        if (exc.status === "cancelled") continue;
        if (exc.start >= wStart && exc.start <= wEnd) {
          const alreadyIncluded = instanceStarts.some(
            (s) => s.getTime() === exc.recurrenceId?.getTime()
          );
          if (!alreadyIncluded) {
            results.push({
              uid: `${uid}:${exc.recurrenceId!.toISOString()}`,
              summary: exc.summary,
              description: exc.description,
              location: exc.location,
              start: exc.start,
              end: exc.end,
              allDay: exc.allDay,
              timezone: exc.timezone,
              status: exc.status,
            });
          }
        }
      }
    } else {
      // Non-recurring: include if it overlaps the window
      if (master.status === "cancelled") continue;
      if (master.end.getTime() >= wStart.getTime() && master.start.getTime() <= wEnd.getTime()) {
        results.push({
          uid: master.uid,
          summary: master.summary,
          description: master.description,
          location: master.location,
          start: master.start,
          end: master.end,
          allDay: master.allDay,
          timezone: master.timezone,
          lastModified: master.lastModified,
          status: master.status,
          recurrenceRule: master.rrule,
        });
      }
    }
  }

  // Include exception events for UIDs that have no master in this feed
  // (e.g. partial iCal export that only has overrides)
  for (const [uid, exMap] of exceptions) {
    if (masters.has(uid)) continue;
    for (const [, exc] of exMap) {
      if (exc.status === "cancelled") continue;
      if (exc.start >= wStart && exc.start <= wEnd) {
        results.push({
          uid: `${uid}:${exc.recurrenceId!.toISOString()}`,
          summary: exc.summary,
          description: exc.description,
          location: exc.location,
          start: exc.start,
          end: exc.end,
          allDay: exc.allDay,
          timezone: exc.timezone,
          status: exc.status,
        });
      }
    }
  }

  return results;
}

export function icalEventToGoogleEvent(
  event: ICalEvent
): calendar_v3.Schema$Event {
  const googleEvent: calendar_v3.Schema$Event = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    iCalUID: event.uid,
    status: event.status === "cancelled" ? "cancelled" : "confirmed",
  };

  if (event.allDay) {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    googleEvent.start = { date: fmt(event.start) };
    googleEvent.end = { date: fmt(event.end) };
  } else if (event.timezone) {
    const toLocal = (d: Date) =>
      d.toLocaleString("sv", { timeZone: event.timezone }).replace(" ", "T");
    googleEvent.start = { dateTime: toLocal(event.start), timeZone: event.timezone };
    googleEvent.end = { dateTime: toLocal(event.end), timeZone: event.timezone };
  } else {
    googleEvent.start = { dateTime: event.start.toISOString(), timeZone: "UTC" };
    googleEvent.end = { dateTime: event.end.toISOString(), timeZone: "UTC" };
  }

  if (event.recurrenceRule) {
    googleEvent.recurrence = [event.recurrenceRule];
  }

  return googleEvent;
}
