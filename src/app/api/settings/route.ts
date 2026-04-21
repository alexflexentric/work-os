import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.userId },
  });
  return NextResponse.json(settings ?? {});
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["anthropicApiKey", "openaiApiKey", "microsoftClientId", "microsoftClientSecret", "microsoftTenantId", "syncInterval"];
  const data = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.userId },
    update: data,
    create: { userId: session.userId, ...data },
  });
  return NextResponse.json(settings);
}
