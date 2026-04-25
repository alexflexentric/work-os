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

  const detectedProvider = account?.provider === "microsoft-entra-id" ? "microsoft" : "google";
  const masterCalendarProvider = settings?.masterCalendarProvider ?? detectedProvider;

  return NextResponse.json({ ...(settings ?? {}), masterCalendarProvider });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["anthropicApiKey", "openaiApiKey", "masterCalendarProvider", "calendarId", "syncInterval"];
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
