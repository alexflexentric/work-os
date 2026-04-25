import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const connection = await prisma.calendarConnection.findFirst({
    where: { id, userId: session.userId },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.calendarConnection.update({
    where: { id },
    data: { isActive: !connection.isActive },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const connection = await prisma.calendarConnection.findFirst({
    where: { id, userId: session.userId },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.calendarConnection.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
