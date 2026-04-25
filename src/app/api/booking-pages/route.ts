import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_SCHEDULE } from "@/lib/availability-schedule";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pages = await prisma.bookingPage.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { bookings: true } } },
  });

  return NextResponse.json(pages);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, slug, durations, schedule, calendarSources, timezone } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  const existing = await prisma.bookingPage.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  const page = await prisma.bookingPage.create({
    data: {
      userId: session.userId,
      name,
      slug,
      durations: durations ?? [30, 60],
      schedule: schedule ?? DEFAULT_SCHEDULE,
      calendarSources: calendarSources ?? ["master"],
      timezone: timezone ?? "UTC",
    },
  });

  return NextResponse.json(page, { status: 201 });
}
