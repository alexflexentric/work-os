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
  // Build ISO string treating local time as UTC (first approximation)
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const approx = new Date(`${pad(y, 4)}-${pad(mo + 1)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}Z`);
  try {
    // 'sv' locale always returns "YYYY-MM-DD HH:mm:ss" (24-hour, no locale quirks)
    const localStr = approx.toLocaleString("sv", { timeZone: tzid });
    const localAsUtc = new Date(localStr.replace(" ", "T") + "Z");
    const offsetMs = localAsUtc.getTime() - approx.getTime();
    // Second pass with corrected UTC — handles DST boundary edge cases
    const corrected = new Date(approx.getTime() - offsetMs);
    const localStr2 = corrected.toLocaleString("sv", { timeZone: tzid });
    const localAsUtc2 = new Date(localStr2.replace(" ", "T") + "Z");
    const offsetMs2 = localAsUtc2.getTime() - corrected.getTime();
    return new Date(approx.getTime() - offsetMs2);
  } catch {
    return approx; // unknown TZ — treat as UTC
  }
}

function parseICalDate(value: string, tzid?: string): { date: Date; allDay: boolean } {
  // DATE-only format: YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    const year = parseInt(value.slice(0, 4));
    const month = parseInt(value.slice(4, 6)) - 1;
    const day = parseInt(value.slice(6, 8));
    return { date: new Date(Date.UTC(year, month, day)), allDay: true };
  }
  // DATE-TIME with explicit UTC suffix → always UTC
  if (value.endsWith("Z")) {
    const iso = value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z");
    return { date: new Date(iso), allDay: false };
  }
  // DATE-TIME with TZID → convert local time to UTC
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (m && tzid) {
    const [, y, mo, d, h, mi, s] = m.map(Number);
    return { date: localToUtc(y, mo - 1, d, h, mi, s, normalizeTimezone(tzid)), allDay: false };
  }
  // Fallback: parse as-is (bare datetime without TZ → treat as UTC)
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

export async function fetchAndParseIcal(url: string): Promise<ICalEvent[]> {
  // webcal:// is a calendar-app alias for https://
  const normalizedUrl = url.replace(/^webcal:\/\//i, "https://");
  const res = await fetch(normalizedUrl, {
    headers: { "User-Agent": "Calypso/1.0 calendar-sync" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch iCal feed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  return parseIcalText(text);
}

export function parseIcalText(text: string): ICalEvent[] {
  const lines = unfoldLines(text);
  const events: ICalEvent[] = [];

  let inEvent = false;
  let current: Partial<ICalEvent> & { uid?: string } = {};
  let allDay = false;
  let eventTimezone: string | undefined;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
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
          recurrenceRule: current.recurrenceRule,
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
        // Basic DURATION support: P1D, PT1H, etc.
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
        current.recurrenceRule = `RRULE:${value}`;
        break;
    }
  }

  return events;
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
    // Preserve original TZID so Google Calendar handles DST correctly for recurring events.
    // Convert UTC Date back to local time string in the original timezone.
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
