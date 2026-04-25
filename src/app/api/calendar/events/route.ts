import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end required" }, { status: 400 });

  const events = await prisma.calendarEvent.findMany({
    where: {
      userId: session.userId,
      startAt: { lte: new Date(end + "T23:59:59Z") },
      endAt:   { gte: new Date(start + "T00:00:00Z") },
    },
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json(events);
}
