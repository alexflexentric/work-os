import { buildAuthHandlers } from "@/auth";

export async function GET(req: Request) {
  const handlers = await buildAuthHandlers();
  return handlers.GET(req);
}

export async function POST(req: Request) {
  const handlers = await buildAuthHandlers();
  return handlers.POST(req);
}
