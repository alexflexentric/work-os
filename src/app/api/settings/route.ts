import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, account] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: session.userId } }),
    prisma.account.findFirst({ where: { userId: session.userId }, select: { provider: true } }),
  ]);

  const masterCalendarProvider = account?.provider === "microsoft-entra-id" ? "microsoft" : "google";

  return NextResponse.json({ ...(settings ?? {}), masterCalendarProvider });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const update = {
    ...(body.anthropicApiKey !== undefined   && { anthropicApiKey:        String(body.anthropicApiKey) }),
    ...(body.openaiApiKey !== undefined       && { openaiApiKey:           String(body.openaiApiKey) }),
    ...(body.masterCalendarProvider !== undefined && { masterCalendarProvider: String(body.masterCalendarProvider) }),
    ...(body.masterCalendarColor !== undefined && { masterCalendarColor:   body.masterCalendarColor == null ? null : String(body.masterCalendarColor) }),
    ...(body.calendarId !== undefined         && { calendarId:             body.calendarId == null ? null : String(body.calendarId) }),
    ...(body.syncInterval !== undefined       && { syncInterval:           parseInt(String(body.syncInterval)) || 15 }),
    ...(body.calendarStartHour !== undefined  && { calendarStartHour:      parseInt(String(body.calendarStartHour)) || 0 }),
    ...(body.calendarEndHour !== undefined    && { calendarEndHour:        parseInt(String(body.calendarEndHour)) || 24 }),
  };

  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId: session.userId },
      update,
      create: { userId: session.userId, ...update },
    });
    return NextResponse.json(settings);
  } catch (e) {
    console.error("Settings save error:", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
