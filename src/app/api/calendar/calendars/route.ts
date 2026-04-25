import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listUserCalendars } from "@/lib/google";
import { listMicrosoftCalendars } from "@/lib/microsoft";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.userId },
    select: { masterCalendarProvider: true },
  });

  try {
    if (settings?.masterCalendarProvider === "microsoft") {
      const calendars = await listMicrosoftCalendars(session.userId);
      return NextResponse.json(
        calendars.map((c) => ({ id: c.id, name: c.name, primary: c.isDefaultCalendar }))
      );
    }

    const calendars = await listUserCalendars(session.userId);
    return NextResponse.json(
      (calendars ?? []).map((c) => ({
        id: c.id ?? "",
        name: c.summary ?? "",
        primary: c.primary ?? false,
      }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list calendars";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
