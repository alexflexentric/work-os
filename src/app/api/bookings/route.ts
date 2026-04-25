import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

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
