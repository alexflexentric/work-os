import { google, calendar_v3 } from "googleapis";
import { prisma } from "@/lib/db";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

// colorId → hex — used for backgroundColor patch (avoids Google's internal ID mapping)
const COLOR_HEX: Record<string, string> = {
  "1": "#d50000",
  "2": "#e67c73",
  "3": "#f4511e",
  "4": "#f6bf26",
  "5": "#33b679",
  "6": "#0b8043",
  "7": "#039be5",
  "8": "#3f51b5",
  "9": "#7986cb",
  "10": "#8e24aa",
  "11": "#616161",
};

async function createOAuth2Client() {
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  return new google.auth.OAuth2(
    config?.googleClientId ?? process.env.GOOGLE_CLIENT_ID!,
    config?.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getAuthenticatedClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.access_token) {
    throw new Error("No Google account connected for user");
  }

  const oauth2Client = await createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Auto-refresh and persist updated tokens
  oauth2Client.on("tokens", async (tokens) => {
    const updateData: Record<string, string | number | null> = {};
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date)
      updateData.expires_at = Math.floor(tokens.expiry_date / 1000);

    if (Object.keys(updateData).length > 0) {
      await prisma.account.update({
        where: { id: account.id },
        data: updateData,
      });
    }
  });

  return oauth2Client;
}

export async function getCalendarClient(userId: string) {
  const auth = await getAuthenticatedClient(userId);
  return google.calendar({ version: "v3", auth });
}

export async function listUserCalendars(userId: string) {
  const cal = await getCalendarClient(userId);
  const res = await cal.calendarList.list();
  return res.data.items ?? [];
}

export async function createCalendar(
  userId: string,
  name: string
): Promise<string> {
  const cal = await getCalendarClient(userId);
  const res = await cal.calendars.insert({
    requestBody: { summary: name },
  });
  if (!res.data.id) throw new Error("Failed to create Google Calendar");
  return res.data.id;
}

export async function createCalendarWithColor(
  userId: string,
  name: string,
  colorId?: string
): Promise<string> {
  const cal = await getCalendarClient(userId);
  const res = await cal.calendars.insert({
    requestBody: { summary: name },
  });
  const id = res.data.id;
  if (!id) throw new Error("Failed to create Google Calendar");

  if (colorId && COLOR_HEX[colorId]) {
    await cal.calendarList.patch({
      calendarId: id,
      colorRgbFormat: true,
      requestBody: { backgroundColor: COLOR_HEX[colorId], foregroundColor: "#ffffff" },
    });
  }

  return id;
}

export async function getCalendarListEntry(
  userId: string,
  calendarId: string
): Promise<{ name: string; colorHex: string | null }> {
  const cal = await getCalendarClient(userId);
  const res = await cal.calendarList.get({ calendarId });
  return {
    name: res.data.summary ?? "",
    colorHex: res.data.backgroundColor ?? null,
  };
}

export async function updateCalendarName(
  userId: string,
  calendarId: string,
  name: string
): Promise<void> {
  const cal = await getCalendarClient(userId);
  await cal.calendars.patch({ calendarId, requestBody: { summary: name } });
}

export async function setCalendarColor(
  userId: string,
  calendarId: string,
  colorId: string
): Promise<void> {
  const cal = await getCalendarClient(userId);
  const hex = COLOR_HEX[colorId];
  await cal.calendarList.patch({
    calendarId,
    colorRgbFormat: !!hex,
    requestBody: hex
      ? { backgroundColor: hex, foregroundColor: "#ffffff" }
      : { colorId },
  });
}

export async function ensureCalypsoBookingsCalendar(
  userId: string
): Promise<string> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (settings?.calendarId) {
    return settings.calendarId;
  }

  // colorId "7" = Peacock (teal) — distinct from sync calendars
  const calendarId = await createCalendarWithColor(
    userId,
    "[Work OS] Bookings",
    "7"
  );

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, calendarId },
    update: { calendarId },
  });

  return calendarId;
}

export async function deleteCalendar(
  userId: string,
  calendarId: string
): Promise<void> {
  const cal = await getCalendarClient(userId);
  await cal.calendars.delete({ calendarId });
}

export async function registerWatch(
  userId: string,
  calendarId: string,
  channelId: string,
  webhookUrl: string
): Promise<{ resourceId: string; expiration: Date }> {
  const cal = await getCalendarClient(userId);
  const res = await cal.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: webhookUrl,
    },
  });
  if (!res.data.resourceId || !res.data.expiration) {
    throw new Error("Invalid watch response from Google");
  }
  return {
    resourceId: res.data.resourceId,
    expiration: new Date(parseInt(res.data.expiration, 10)),
  };
}

export async function stopWatch(
  userId: string,
  channelId: string,
  resourceId: string
): Promise<void> {
  try {
    const cal = await getCalendarClient(userId);
    await cal.channels.stop({
      requestBody: { id: channelId, resourceId },
    });
  } catch {
    // Best-effort — ignore if channel already expired
  }
}

export interface GoogleEvent {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start: calendar_v3.Schema$EventDateTime;
  end: calendar_v3.Schema$EventDateTime;
  status: string | null;
  updated: string | null;
  recurrence: string[] | null;
  iCalUID: string | null;
}

export async function listEvents(
  userId: string,
  calendarId: string,
  syncToken?: string | null
): Promise<{ events: calendar_v3.Schema$Event[]; nextSyncToken: string | null }> {
  const cal = await getCalendarClient(userId);
  let pageToken: string | undefined;
  const events: calendar_v3.Schema$Event[] = [];
  let nextSyncToken: string | null = null;

  do {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      pageToken,
      singleEvents: true,
    };

    if (syncToken) {
      params.syncToken = syncToken;
    } else {
      // Full sync — fetch events from 1 year ago to 1 year ahead
      const timeMin = new Date();
      timeMin.setFullYear(timeMin.getFullYear() - 1);
      const timeMax = new Date();
      timeMax.setFullYear(timeMax.getFullYear() + 1);
      params.timeMin = timeMin.toISOString();
      params.timeMax = timeMax.toISOString();
    }

    const res = await cal.events.list(params);
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) {
      nextSyncToken = res.data.nextSyncToken ?? null;
    }
  } while (pageToken);

  return { events, nextSyncToken };
}

// List all events in a calendar that were created by a specific calypso-sync connection.
// Uses the privateExtendedProperty filter so we only touch events we own.
export async function listSyncedEvents(
  userId: string,
  calendarId: string,
  connectionId: string,
  timeMin: string,
  timeMax: string
): Promise<calendar_v3.Schema$Event[]> {
  const cal = await getCalendarClient(userId);
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const res = await cal.events.list({
      calendarId,
      privateExtendedProperty: [`calypso-sync=${connectionId}`],
      timeMin,
      timeMax,
      singleEvents: true,
      showDeleted: false,
      maxResults: 2500,
      pageToken,
    });
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

export async function createEvent(
  userId: string,
  calendarId: string,
  event: calendar_v3.Schema$Event
): Promise<calendar_v3.Schema$Event> {
  const cal = await getCalendarClient(userId);
  const res = await cal.events.insert({
    calendarId,
    requestBody: event,
  });
  return res.data;
}

// Like createEvent but uses events.import which upserts by iCalUID.
// Use this for iCal-sourced events so re-syncing a feed that lost its
// EventMapping records doesn't fail with "identifier already exists".
export async function importEvent(
  userId: string,
  calendarId: string,
  event: calendar_v3.Schema$Event
): Promise<calendar_v3.Schema$Event> {
  const cal = await getCalendarClient(userId);
  const res = await cal.events.import({
    calendarId,
    requestBody: event,
  });
  return res.data;
}

export async function updateEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  event: calendar_v3.Schema$Event
): Promise<calendar_v3.Schema$Event> {
  const cal = await getCalendarClient(userId);
  const res = await cal.events.update({
    calendarId,
    eventId,
    requestBody: event,
  });
  return res.data;
}

export async function deleteEvent(
  userId: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const cal = await getCalendarClient(userId);
  await cal.events.delete({ calendarId, eventId });
}
