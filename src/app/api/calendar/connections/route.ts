import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connections = await prisma.calendarConnection.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sourceCalendarName: true,
      icalUrl: true,
      isActive: true,
      lastSyncedAt: true,
      syncErrors: true,
      lastErrorMessage: true,
    },
  });

  return NextResponse.json(connections);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, url } = await req.json();
  if (!name?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  const connection = await prisma.calendarConnection.create({
    data: {
      userId: session.userId,
      sourceType: "ical",
      sourceCalendarName: name.trim(),
      icalUrl: url.trim(),
      targetGoogleCalendarName: name.trim(),
    },
  });

  return NextResponse.json(connection, { status: 201 });
}
