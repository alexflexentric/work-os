import { prisma } from "@/lib/db";

const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function getMsAppConfig(): Promise<{ tokenUrl: string; clientId: string; clientSecret: string }> {
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  const tenant = config?.microsoftTenantId ?? "common";
  return {
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    clientId: config?.microsoftClientId ?? process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: config?.microsoftClientSecret ?? process.env.MICROSOFT_CLIENT_SECRET ?? "",
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MsAccount {
  id: string;
  providerAccountId: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}

export interface GraphEvent {
  id: string;
  subject: string | null;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  showAs: string | null;
  isCancelled: boolean | null;
  isAllDay?: boolean | null;
  lastModifiedDateTime: string | null;
  bodyPreview: string | null;
  location: { displayName: string } | null;
  "@removed"?: { reason: string };
}

export interface GraphEventInput {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  body?: { contentType: string; content: string };
  location?: { displayName: string };
  isAllDay?: boolean;
}

export interface BookingEventResult {
  eventId: string;
  teamsLink: string | null;
}

// ─── Token management ─────────────────────────────────────────────────────────

async function refreshToken(account: MsAccount): Promise<string> {
  if (!account.refresh_token) throw new Error("No MS refresh token available");

  const { tokenUrl, clientId, clientSecret } = await getMsAppConfig();

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      scope: "offline_access Calendars.ReadWrite User.Read",
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!data.access_token) {
    throw new Error(`MS token refresh failed: ${data.error ?? "unknown"}`);
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? account.refresh_token,
      expires_at: data.expires_in
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : null,
    },
  });

  return data.access_token;
}

async function getValidToken(account: MsAccount): Promise<string> {
  const expiredOrMissing =
    !account.access_token ||
    (account.expires_at !== null &&
      account.expires_at * 1000 < Date.now() + 60_000);

  if (expiredOrMissing) return refreshToken(account);
  return account.access_token!;
}

// ─── Graph API helpers ────────────────────────────────────────────────────────

async function graphGet<T>(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${MS_GRAPH_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      // Ask Graph to return all datetimes in UTC
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// Paginate through all pages of a Graph collection
async function graphGetAll<T>(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T[]> {
  let url: string | null = null;
  const results: T[] = [];

  // Build initial URL
  const initial = new URL(`${MS_GRAPH_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) initial.searchParams.set(k, v);
  }
  url = initial.toString();

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API ${path} → ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      value: T[];
      "@odata.nextLink"?: string;
    };
    results.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
  }

  return results;
}

async function graphPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${MS_GRAPH_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph POST ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function graphPatch<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${MS_GRAPH_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PATCH ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function graphDelete(token: string, path: string): Promise<void> {
  const res = await fetch(`${MS_GRAPH_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Graph DELETE ${path} → ${res.status}: ${text}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getMicrosoftAccounts(userId: string): Promise<MsAccount[]> {
  return prisma.account.findMany({
    where: { userId, provider: { in: ["microsoft-entra-id", "microsoft"] } },
    select: {
      id: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });
}

export interface MsCalendar {
  id: string;
  name: string;
  isDefaultCalendar: boolean;
  accountId: string;
  providerAccountId: string;
}

export async function listMicrosoftCalendars(
  userId: string
): Promise<MsCalendar[]> {
  const accounts = await getMicrosoftAccounts(userId);
  const result: MsCalendar[] = [];

  for (const account of accounts) {
    try {
      const token = await getValidToken(account);
      const calendars = await graphGetAll<{
        id: string;
        name: string;
        isDefaultCalendar: boolean;
      }>(token, "/me/calendars");

      result.push(
        ...calendars.map((c) => ({
          id: c.id,
          name: c.name,
          isDefaultCalendar: c.isDefaultCalendar,
          accountId: account.id,
          providerAccountId: account.providerAccountId,
        }))
      );
    } catch (err) {
      console.error(
        `Failed to list MS calendars for account ${account.id}:`,
        err
      );
    }
  }

  return result;
}

export interface MsBusyInterval {
  start: number; // ms timestamp
  end: number;
}

// Fetch all MS calendar events in range, return as busy intervals for freebusy merging
export async function getMicrosoftBusyIntervals(
  userId: string,
  startDateTime: string,
  endDateTime: string
): Promise<MsBusyInterval[]> {
  const accounts = await getMicrosoftAccounts(userId);
  const allBusy: MsBusyInterval[] = [];

  for (const account of accounts) {
    try {
      const token = await getValidToken(account);

      // calendarView returns all events intersecting the range across ALL calendars
      const events = await graphGetAll<GraphEvent>(token, "/me/calendarView", {
        startDateTime,
        endDateTime,
        $select: "start,end,showAs,isCancelled",
        $top: "500",
      });

      for (const ev of events) {
        if (ev.isCancelled) continue;
        // Skip free/working elsewhere — only block on busy/tentative/oof
        if (ev.showAs === "free" || ev.showAs === "workingElsewhere") continue;

        // Times are in UTC (Prefer header above)
        const start = new Date(ev.start.dateTime + "Z").getTime();
        const end = new Date(ev.end.dateTime + "Z").getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
          allBusy.push({ start, end });
        }
      }
    } catch (err) {
      // Non-fatal — skip this account's contribution but don't break free slot search
      console.error(`MS freebusy error for account ${account.id}:`, err);
    }
  }

  return allBusy;
}

// Fetch events from a specific MS account + calendar for syncing to Google
export async function getMicrosoftEvents(
  accountId: string,
  startDateTime: string,
  endDateTime: string
): Promise<GraphEvent[]> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account) throw new Error(`MS account ${accountId} not found`);

  const token = await getValidToken(account);
  return graphGetAll<GraphEvent>(token, "/me/calendarView", {
    startDateTime,
    endDateTime,
    $top: "1000",
  });
}

// Delta sync — returns changed events + new delta token for incremental next run
export interface MsDeltaResult {
  events: GraphEvent[];
  deltaToken: string;
}

export async function getMicrosoftEventsDelta(
  accountId: string,
  storedDeltaToken: string | null,
  windowStart?: string,
  windowEnd?: string
): Promise<MsDeltaResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, providerAccountId: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account) throw new Error(`MS account ${accountId} not found`);

  const token = await getValidToken(account);
  const events: GraphEvent[] = [];

  // Build initial URL — delta link for incremental, date range for first sync
  let url: string;
  if (storedDeltaToken) {
    const u = new URL(`${MS_GRAPH_BASE}/me/calendarView/delta`);
    u.searchParams.set("$deltatoken", storedDeltaToken);
    url = u.toString();
  } else {
    const start = windowStart ?? new Date().toISOString();
    const end = windowEnd ?? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const u = new URL(`${MS_GRAPH_BASE}/me/calendarView/delta`);
    u.searchParams.set("startDateTime", start);
    u.searchParams.set("endDateTime", end);
    url = u.toString();
  }

  let newDeltaToken = "";

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC", odata.maxpagesize=500' },
    });

    // 410 = delta token expired — caller should retry with null token
    if (res.status === 410) {
      const err = new Error("MS delta token expired") as Error & { code: string };
      err.code = "DELTA_EXPIRED";
      throw err;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph delta → ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      value: GraphEvent[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };

    events.push(...(data.value ?? []));

    if (data["@odata.deltaLink"]) {
      // Extract just the deltatoken param value for compact storage
      const deltaUrl = new URL(data["@odata.deltaLink"]);
      newDeltaToken = deltaUrl.searchParams.get("$deltatoken") ?? data["@odata.deltaLink"];
      url = "";
    } else {
      url = data["@odata.nextLink"] ?? "";
    }
  }

  return { events, deltaToken: newDeltaToken };
}

// Write events to the user's default MS calendar
export async function createMicrosoftEvent(
  accountId: string,
  event: GraphEventInput
): Promise<GraphEvent> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, providerAccountId: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account) throw new Error(`MS account ${accountId} not found`);
  const token = await getValidToken(account);
  return graphPost<GraphEvent>(token, "/me/calendar/events", event);
}

export async function updateMicrosoftEvent(
  accountId: string,
  msEventId: string,
  event: Partial<GraphEventInput>
): Promise<GraphEvent> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, providerAccountId: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account) throw new Error(`MS account ${accountId} not found`);
  const token = await getValidToken(account);
  return graphPatch<GraphEvent>(token, `/me/calendar/events/${msEventId}`, event);
}

export async function deleteMicrosoftEvent(
  accountId: string,
  msEventId: string
): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, providerAccountId: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account) throw new Error(`MS account ${accountId} not found`);
  const token = await getValidToken(account);
  await graphDelete(token, `/me/calendar/events/${msEventId}`);
}

// ─── Event conversion helpers ─────────────────────────────────────────────────

export function graphEventToGoogleEvent(ev: GraphEvent): {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
} {
  const isAllDay = ev.isAllDay ?? false;
  const toDate = (dt: string) => dt.slice(0, 10); // YYYY-MM-DD

  return {
    summary: ev.subject ?? "(No title)",
    description: ev.bodyPreview ?? undefined,
    location: ev.location?.displayName ?? undefined,
    start: isAllDay
      ? { date: toDate(ev.start.dateTime) }
      : { dateTime: ev.start.dateTime + (ev.start.dateTime.endsWith("Z") ? "" : "Z"), timeZone: "UTC" },
    end: isAllDay
      ? { date: toDate(ev.end.dateTime) }
      : { dateTime: ev.end.dateTime + (ev.end.dateTime.endsWith("Z") ? "" : "Z"), timeZone: "UTC" },
    status: ev.isCancelled ? "cancelled" : "confirmed",
  };
}

export function googleEventToGraphBody(ev: {
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}): GraphEventInput {
  const isAllDay = !ev.start?.dateTime;
  const startDt = (ev.start?.dateTime ?? `${ev.start?.date ?? ""}T00:00:00`);
  const endDt = (ev.end?.dateTime ?? `${ev.end?.date ?? ""}T00:00:00`);

  return {
    subject: ev.summary ?? "(No title)",
    body: ev.description ? { contentType: "text", content: ev.description } : undefined,
    location: ev.location ? { displayName: ev.location } : undefined,
    isAllDay,
    start: { dateTime: startDt.replace("Z", ""), timeZone: "UTC" },
    end: { dateTime: endDt.replace("Z", ""), timeZone: "UTC" },
  };
}

// Fetch all events visible in a calendar view for the user (all calendars)
export async function listMicrosoftCalendarView(
  userId: string,
  startDateTime: string,
  endDateTime: string
): Promise<GraphEvent[]> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: { in: ["microsoft-entra-id", "microsoft"] } },
    select: { id: true, providerAccountId: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account) return [];

  const token = await getValidToken(account);
  const events = await graphGetAll<GraphEvent>(token, "/me/calendarView", {
    startDateTime,
    endDateTime,
    $select: "id,subject,start,end,isAllDay,isCancelled,showAs,location",
    $top: "500",
  });

  return events.filter((e) => !e.isCancelled && !e["@removed"]);
}

// Create a calendar event for a booking — auto-generates Teams link and sends
// the native Outlook invite to the guest attendee.
// The organizer's own email is fetched from the connected MS account and added
// as a required attendee so they receive RSVPs when the guest accepts/declines.
export async function createBookingCalendarEvent(
  userId: string,
  {
    calendarId,
    subject,
    startUtc,
    endUtc,
    guestName,
    guestEmail,
    guestCompany,
    note,
    address,
  }: {
    calendarId: string | null;
    subject: string;
    startUtc: string;
    endUtc: string;
    guestName: string;
    guestEmail: string;
    guestCompany: string;
    note?: string | null;
    address?: string | null;
  }
): Promise<BookingEventResult> {
  const accounts = await getMicrosoftAccounts(userId);
  if (accounts.length === 0) throw new Error("No Microsoft account connected");

  const account = accounts[0];
  const token = await getValidToken(account);

  const bodyLines = [`Company: ${guestCompany}`];
  if (note) bodyLines.push(`Note: ${note}`);
  if (address) bodyLines.push(`Address: ${address}`);

  // Graph automatically routes RSVP responses to the organizer (the API caller);
  // adding the organizer as an explicit attendee is silently ignored by Graph.
  const attendees = [
    { emailAddress: { address: guestEmail, name: guestName }, type: "required" },
  ];

  const eventBody = {
    subject,
    start: { dateTime: startUtc.replace("Z", ""), timeZone: "UTC" },
    end: { dateTime: endUtc.replace("Z", ""), timeZone: "UTC" },
    body: { contentType: "text", content: bodyLines.join("\n") },
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    attendees,
    ...(address ? { location: { displayName: address } } : {}),
  };

  const path = calendarId
    ? `/me/calendars/${calendarId}/events`
    : "/me/calendar/events";

  const created = await graphPost<
    GraphEvent & { onlineMeeting?: { joinUrl?: string } }
  >(token, path, eventBody);

  return {
    eventId: created.id,
    teamsLink: created.onlineMeeting?.joinUrl ?? null,
  };
}

// Get a user's MS display name / email for labelling
export async function getMicrosoftProfile(
  accountId: string
): Promise<{ displayName: string; mail: string; id: string }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account) throw new Error(`MS account ${accountId} not found`);

  const token = await getValidToken(account);
  return graphGet(token, "/me", { $select: "displayName,mail,id" });
}
