import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({ where: { userId: session.userId } });
  if (!settings?.openaiApiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "No audio file" }, { status: 400 });

  const openai = new OpenAI({ apiKey: settings.openaiApiKey });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });

  return NextResponse.json({ text: transcription.text });
}
