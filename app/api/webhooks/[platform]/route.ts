import { after } from "next/server";
import { bot, ensureBotInitialized } from "@/lib/bot";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;

  // Deduplicate Slack retries triggered by slow responses
  if (platform === "slack") {
    const retryNum = request.headers.get("x-slack-retry-num");
    const retryReason = request.headers.get("x-slack-retry-reason");
    if (retryNum && retryReason === "http_timeout") {
      console.info("webhook:slack:retry-skipped", { retryNum });
      return new Response("OK", { status: 200 });
    }
  }

  // Kick off initialization in the background — don't block webhook processing.
  // If init fails (e.g. state DB unreachable), log it but still handle the event.
  ensureBotInitialized().catch((err) => {
    console.error("bot:init:failed", { error: String(err) });
  });

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
