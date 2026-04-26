import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse, type NextRequest } from "next/server";
import { getBusyIntervals, mergeBusyIntervals, localToUtcIso, type BusyInterval } from "@/lib/freebusy";
import { createBookingCalendarEvent } from "@/lib/microsoft";
import { sendBookingConfirmationEmail, sendBookingNotificationEmail } from "@/lib/email";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookings = await prisma.booking.findMany({
    where: { bookingPage: { userId: session.userId } },
    include: { bookingPage: { select: { name: true, slug: true } } },
    orderBy: { startAt: "desc" },
  });

  return NextResponse.json(bookings);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { bookingPageId, guestName, guestEmail, guestCompany, subject, note, location, address, start, durationMinutes } = body as Record<string, string | number>;

  if (!bookingPageId || !guestName || !guestEmail || !guestCompany || !subject || !location || !start || !durationMinutes) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (location === "offline" && !address) {
    return NextResponse.json({ error: "address_required" }, { status: 400 });
  }

  const bookingPage = await prisma.bookingPage.findUnique({
    where: { id: String(bookingPageId) },
    select: { id: true, userId: true, name: true, timezone: true, calendarSources: true, durations: true },
  });
  if (!bookingPage || bookingPage.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { userId, timezone, calendarSources } = bookingPage;
  const startUtc = localToUtcIso(String(start), timezone);
  const endUtc = new Date(new Date(startUtc).getTime() + Number(durationMinutes) * 60_000).toISOString();
  const startMs = new Date(startUtc).getTime();
  const endMs = new Date(endUtc).getTime();

  const startDate = new Date(startUtc);
  const endDate = new Date(endUtc);

  const masterBusy = calendarSources.includes("master")
    ? await getBusyIntervals(userId, startUtc, endUtc).catch(() => [] as BusyInterval[])
    : [];
  const cachedBusy: BusyInterval[] = calendarSources.length > 0
    ? (await prisma.calendarEvent.findMany({
        where: { userId, source: { in: calendarSources }, startAt: { lt: endDate }, endAt: { gt: startDate } },
        select: { startAt: true, endAt: true },
      })).map((e) => ({ start: e.startAt.getTime(), end: e.endAt.getTime() }))
    : [];
  const bookingBusy: BusyInterval[] = (
    await prisma.booking.findMany({
      where: { bookingPageId: bookingPage.id, status: { not: "declined" }, startAt: { lt: endDate }, endAt: { gt: startDate } },
      select: { startAt: true, endAt: true },
    })
  ).map((b) => ({ start: b.startAt.getTime(), end: b.endAt.getTime() }));

  const busy = mergeBusyIntervals([...masterBusy, ...cachedBusy, ...bookingBusy]);
  if (busy.find((b) => startMs < b.end && endMs > b.start)) {
    return NextResponse.json({ error: "slot_taken" }, { status: 409 });
  }

  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { calendarId: true } });

  let teamsLink: string | null = null;
  let outlookEventId: string | null = null;
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
    console.error("[bookings/internal] Calendar event error:", err);
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

  // Immediately write to CalendarEvent cache so the meeting appears in the
  // calendar view without waiting for the next sync cycle.
  if (outlookEventId) {
    await prisma.calendarEvent.upsert({
      where: { userId_source_externalId: { userId, source: "master", externalId: outlookEventId } },
      create: { userId, source: "master", externalId: outlookEventId, title: String(subject), startAt: new Date(startUtc), endAt: new Date(endUtc), allDay: false, location: address ? String(address) : null },
      update: { title: String(subject), startAt: new Date(startUtc), endAt: new Date(endUtc), allDay: false, location: address ? String(address) : null },
    }).catch((err) => console.error("[bookings/internal] CalendarEvent upsert error:", err));
  }

  const dateLabel = new Date(startUtc).toLocaleString("en-GB", {
    timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

  sendBookingConfirmationEmail(String(guestEmail), {
    guestName: String(guestName), subject: String(subject), dateLabel,
    durationMinutes: Number(durationMinutes), location: String(location),
    teamsLink, address: address ? String(address) : null,
    hostName: user?.name ?? "Alex Parkhomchuk",
  }).catch((err) => console.error("[bookings/internal] Confirmation email error:", err));

  sendBookingNotificationEmail({
    guestName: String(guestName), guestEmail: String(guestEmail), guestCompany: String(guestCompany),
    subject: String(subject), dateLabel, durationMinutes: Number(durationMinutes),
    location: String(location), address: address ? String(address) : null,
    note: note ? String(note) : null, bookingPageName: bookingPage.name,
  }).catch((err) => console.error("[bookings/internal] Notification email error:", err));

  return NextResponse.json({ bookingId: booking.id, teamsLink }, { status: 201 });
}
