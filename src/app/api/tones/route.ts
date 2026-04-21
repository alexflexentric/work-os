import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tones = await prisma.tone.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(tones);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, instructions } = await req.json();
  const tone = await prisma.tone.create({ data: { userId: session.userId, name, instructions } });
  return NextResponse.json(tone);
}
