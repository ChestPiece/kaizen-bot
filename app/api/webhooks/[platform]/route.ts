import { after } from "next/server";
import { bot } from "@/lib/bot";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const webhookHandler = (
    bot.webhooks as Record<
      string,
      ((req: Request, opts: unknown) => Promise<Response>) | undefined
    >
  )[platform];

  if (!webhookHandler) {
    return Response.json(
      { error: `Unsupported platform: ${platform}` },
      { status: 404 },
    );
  }

  return webhookHandler(request, {
    waitUntil: (task: Promise<unknown>) => after(() => task),
  });
}
