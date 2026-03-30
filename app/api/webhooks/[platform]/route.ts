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

  // Handle Slack URL verification challenge before signature checks
  if (platform === "slack") {
    const cloned = request.clone();
    const body = await cloned.json().catch(() => null);
    if (body?.type === "url_verification") {
      return Response.json({ challenge: body.challenge });
    }
  }

  return webhookHandler(request, {
    waitUntil: (task: Promise<unknown>) => after(() => task),
  });
}
