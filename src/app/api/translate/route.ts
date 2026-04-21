import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.userId },
    include: { user: { include: { tones: true } } },
  });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 400 });
  }

  const { input, targetLanguage, format, toneId } = await req.json();
  if (!input) return NextResponse.json({ error: "No input text" }, { status: 400 });

  const tone = toneId
    ? settings.user.tones.find((t) => t.id === toneId)
    : null;

  const formatInstructions: Record<string, string> = {
    chat: "Respond conversationally and concisely, as a short chat message.",
    email: 'Respond with a JSON object: {"subject": "...", "body": "..."}',
    note: "Respond as a concise structured note.",
  };

  const systemPrompt = [
    `You are a professional translator and writer.`,
    targetLanguage ? `Output language: ${targetLanguage}.` : "",
    tone ? `Tone: ${tone.name}. ${tone.instructions}` : "",
    formatInstructions[format] ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const client = new Anthropic({ apiKey: settings.anthropicApiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: input }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return NextResponse.json({ text });
}
