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
      color: true,
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

  const body = await req.json();
  const name = body.name?.trim() ?? "";
  const url = body.url?.trim() ?? "";
  if (!name || !url) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  const connection = await prisma.calendarConnection.create({
    data: {
      userId: session.userId,
      sourceType: "ical",
      sourceCalendarName: name,
      icalUrl: url,
      targetGoogleCalendarName: name,
    },
  });

  return NextResponse.json(connection, { status: 201 });
}
