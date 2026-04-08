import { after } from "next/server";
import { bot, ensureBotInitialized } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Platform = keyof typeof bot.webhooks;
type WebhookRouteContext = {
  params: Promise<{ platform: string }>;
};

export async function POST(
  request: Request,
  context: WebhookRouteContext,
) {
  const { platform } = await context.params;

  const retryNum = request.headers.get("x-slack-retry-num");
  const retryReason = request.headers.get("x-slack-retry-reason");
  if (platform === "slack" && retryNum && retryReason === "http_timeout") {
    console.info("webhook:slack:retry-skipped", { retryNum, retryReason });
    return new Response("OK", { status: 200 });
  }

  try {
    await ensureBotInitialized();
  } catch (error) {
    console.error("webhook:init:failed", {
      platform,
      error: String(error),
    });
    return new Response("Service Unavailable", { status: 503 });
  }

  const handler = bot.webhooks[platform as Platform];

  if (!handler) {
    return new Response(`Unknown platform: ${platform}`, { status: 404 });
  }

  return handler(request, {
    waitUntil: (task) => after(() => task),
  });
}
