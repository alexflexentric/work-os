import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse, type NextRequest } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const page = await prisma.bookingPage.findUnique({ where: { id } });
  if (!page || page.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, slug, durations, schedule, calendarSources, timezone } = body;

  if (slug && slug !== page.slug) {
    const conflict = await prisma.bookingPage.findUnique({ where: { slug } });
    if (conflict) return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  const updated = await prisma.bookingPage.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(slug !== undefined && { slug }),
      ...(durations !== undefined && { durations }),
      ...(schedule !== undefined && { schedule }),
      ...(calendarSources !== undefined && { calendarSources }),
      ...(timezone !== undefined && { timezone }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const page = await prisma.bookingPage.findUnique({ where: { id } });
  if (!page || page.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.bookingPage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
