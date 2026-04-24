import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.userId },
  });
  if (!settings?.anthropicApiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 400 });
  }

  const { input, targetLanguage, formatId, toneId } = await req.json();
  if (!input) return NextResponse.json({ error: "No input text" }, { status: 400 });

  const [tone, format] = await Promise.all([
    toneId ? prisma.tone.findFirst({ where: { id: toneId, userId: session.userId } }) : null,
    formatId ? prisma.format.findFirst({ where: { id: formatId, userId: session.userId } }) : null,
  ]);

  const isEmail = format?.name.toLowerCase() === "email";

  const systemPrompt = [
    `You are a professional translator and writer.`,
    targetLanguage ? `Output language: ${targetLanguage}.` : "",
    tone ? `Tone: ${tone.name}. ${tone.instructions}` : "",
    format ? format.instructions : "",
    isEmail ? 'Respond with a JSON object only: {"subject": "...", "body": "..."}' : "",
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
  return NextResponse.json({ text, isEmail });
}
