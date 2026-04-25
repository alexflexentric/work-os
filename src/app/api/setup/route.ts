import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "alex@flexentric.com";

export async function GET() {
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({
    configured: !!(config?.googleClientId || config?.microsoftClientId),
    hasGoogle: !!(config?.googleClientId && config?.googleClientSecret),
    hasMicrosoft: !!(config?.microsoftClientId && config?.microsoftClientSecret),
  });
}

export async function POST(req: Request) {
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  const isFirstRun = !config?.googleClientId && !config?.microsoftClientId;

  if (!isFirstRun) {
    const session = await auth();
    if (session?.user?.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const allowed = [
    "googleClientId", "googleClientSecret",
    "microsoftClientId", "microsoftClientSecret", "microsoftTenantId",
  ];
  const data = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  await prisma.appConfig.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  return NextResponse.json({ ok: true });
}
