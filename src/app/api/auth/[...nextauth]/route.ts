import { buildAuthHandlers } from "@/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const handlers = await buildAuthHandlers();
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  const handlers = await buildAuthHandlers();
  return handlers.POST(req);
}
