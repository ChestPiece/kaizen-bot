import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { bot, ensureBotInitialized } from "@/lib/bot";

type GatewayAdapter = {
  startGatewayListener: (
    options: { waitUntil: (task: Promise<unknown>) => void },
    durationMs?: number,
    abortSignal?: AbortSignal,
    webhookUrl?: string,
  ) => Promise<Response>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("Authorization");
  const expectedAuthHeader = `Bearer ${process.env.CRON_SECRET}`;
  const providedBuffer = Buffer.from(authHeader ?? "");
  const expectedBuffer = Buffer.from(expectedAuthHeader);
  const isAuthorized =
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ skipped: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : null;

  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL or VERCEL_URL must be configured" },
      { status: 500 },
    );
  }

  await ensureBotInitialized();

  const adapter = bot.getAdapter("discord");
  if (
    !adapter ||
    typeof (adapter as Partial<GatewayAdapter>).startGatewayListener !==
      "function"
  ) {
    return NextResponse.json({ skipped: true });
  }

  const discord = adapter as GatewayAdapter;
  const webhookUrl = `${appUrl}/api/webhooks/discord`;
  const durationMs = 9 * 60 * 1000;

  after(async () => {
    await discord.startGatewayListener(
      { waitUntil: (task) => after(() => task) },
      durationMs,
      undefined,
      webhookUrl,
    );
  });

  return NextResponse.json({ started: true });
}
