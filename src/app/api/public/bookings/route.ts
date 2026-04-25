import { type NextRequest, NextResponse } from "next/server";
import { guardPublicApi, corsHeaders } from "@/lib/public-api-guard";
import { prisma } from "@/lib/db";
import { getBusyIntervals, mergeBusyIntervals, localToUtcIso, type BusyInterval } from "@/lib/freebusy";
import { createBookingCalendarEvent } from "@/lib/microsoft";
import { sendBookingConfirmationEmail, sendBookingNotificationEmail } from "@/lib/email";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const guard = guardPublicApi(req);
  if (guard) return guard;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() });
  }

  const { slug, guestName, guestEmail, guestCompany, subject, note, location, address, start, durationMinutes } = body as Record<string, string | number>;

  const missing: string[] = [];
  if (!slug) missing.push("slug");
  if (!guestName) missing.push("guestName");
  if (!guestEmail) missing.push("guestEmail");
  if (!guestCompany) missing.push("guestCompany");
  if (!subject) missing.push("subject");
  if (!location) missing.push("location");
  if (!start) missing.push("start");
  if (!durationMinutes) missing.push("durationMinutes");
  if (missing.length > 0) {
    return NextResponse.json({ error: "missing_fields", fields: missing }, { status: 400, headers: corsHeaders() });
  }

  if (location === "offline" && !address) {
    return NextResponse.json({ error: "address_required" }, { status: 400, headers: corsHeaders() });
  }

  const VALID_DURATIONS = new Set([15, 30, 60, 90, 120]);
  if (!VALID_DURATIONS.has(Number(durationMinutes))) {
    return NextResponse.json({ error: "Invalid duration. Accepted: 15, 30, 60, 90, 120" }, { status: 400, headers: corsHeaders() });
  }

  const bookingPage = await prisma.bookingPage.findUnique({
    where: { slug: String(slug) },
    select: { id: true, userId: true, name: true, timezone: true, calendarSources: true, durations: true },
  });

  if (!bookingPage) {
    return NextResponse.json({ error: "Booking page not found" }, { status: 404, headers: corsHeaders() });
  }

  if (!bookingPage.durations.includes(Number(durationMinutes))) {
    return NextResponse.json({ error: "Duration not allowed for this booking page" }, { status: 400, headers: corsHeaders() });
  }

  const { userId, timezone, calendarSources } = bookingPage;

  const startUtc = localToUtcIso(String(start), timezone);
  const endUtc = new Date(new Date(startUtc).getTime() + Number(durationMinutes) * 60_000).toISOString();
  const startMs = new Date(startUtc).getTime();
  const endMs = new Date(endUtc).getTime();

  // Re-validate the slot is still free
  const masterBusy = calendarSources.includes("master")
    ? await getBusyIntervals(userId, startUtc, endUtc).catch(() => [] as BusyInterval[])
    : [];

  const icalSourceIds = calendarSources.filter((s) => s !== "master");
  const icalBusy: BusyInterval[] =
    icalSourceIds.length > 0
      ? (
          await prisma.calendarEvent.findMany({
            where: { userId, source: { in: icalSourceIds }, startAt: { lt: new Date(endUtc) }, endAt: { gt: new Date(startUtc) } },
            select: { startAt: true, endAt: true },
          })
        ).map((e) => ({ start: e.startAt.getTime(), end: e.endAt.getTime() }))
      : [];

  const existingBookings = await prisma.booking.findMany({
    where: { bookingPageId: bookingPage.id, status: { not: "declined" }, startAt: { lt: new Date(endUtc) }, endAt: { gt: new Date(startUtc) } },
    select: { startAt: true, endAt: true },
  });
  const bookingBusy: BusyInterval[] = existingBookings.map((b) => ({
    start: b.startAt.getTime(),
    end: b.endAt.getTime(),
  }));

  const busy = mergeBusyIntervals([...masterBusy, ...icalBusy, ...bookingBusy]);
  const conflict = busy.find((b) => startMs < b.end && endMs > b.start);
  if (conflict) {
    return NextResponse.json({ error: "slot_taken" }, { status: 409, headers: corsHeaders() });
  }

  // Create calendar event with Teams link
  let teamsLink: string | null = null;
  let outlookEventId: string | null = null;

  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { calendarId: true } });

  try {
    const result = await createBookingCalendarEvent(userId, {
      calendarId: settings?.calendarId ?? null,
      subject: String(subject),
      startUtc,
      endUtc,
      guestName: String(guestName),
      guestEmail: String(guestEmail),
      guestCompany: String(guestCompany),
      note: note ? String(note) : null,
      address: address ? String(address) : null,
    });
    teamsLink = result.teamsLink;
    outlookEventId = result.eventId;
  } catch (err) {
    console.error("[bookings] Failed to create calendar event:", err);
  }

  const booking = await prisma.booking.create({
    data: {
      bookingPageId: bookingPage.id,
      guestName: String(guestName),
      guestEmail: String(guestEmail),
      guestCompany: String(guestCompany),
      subject: String(subject),
      note: note ? String(note) : null,
      location: String(location),
      address: address ? String(address) : null,
      startAt: new Date(startUtc),
      endAt: new Date(endUtc),
      durationMinutes: Number(durationMinutes),
      status: "approved",
      teamsLink,
      outlookEventId,
    },
  });

  // Format date label for emails
  const dateLabel = new Date(startUtc).toLocaleString("en-GB", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

  // Send emails (non-blocking)
  sendBookingConfirmationEmail(String(guestEmail), {
    guestName: String(guestName),
    subject: String(subject),
    dateLabel,
    durationMinutes: Number(durationMinutes),
    location: String(location),
    teamsLink,
    address: address ? String(address) : null,
    hostName: user?.name ?? "Alex Parkhomchuk",
  }).catch((err) => console.error("[bookings] Confirmation email error:", err));

  sendBookingNotificationEmail({
    guestName: String(guestName),
    guestEmail: String(guestEmail),
    guestCompany: String(guestCompany),
    subject: String(subject),
    dateLabel,
    durationMinutes: Number(durationMinutes),
    location: String(location),
    address: address ? String(address) : null,
    note: note ? String(note) : null,
    bookingPageName: bookingPage.name,
  }).catch((err) => console.error("[bookings] Notification email error:", err));

  return NextResponse.json({ bookingId: booking.id }, { status: 201, headers: corsHeaders() });
}
