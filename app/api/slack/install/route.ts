import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { slackMode } from "@/lib/bot";

const BOT_SCOPES = [
  "app_mentions:read",
  "channels:history",
  "channels:read",
  "chat:write",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "im:write",
  "mpim:history",
  "mpim:read",
  "reactions:read",
  "reactions:write",
  "users:read",
];

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (slackMode !== "multi-workspace") {
    return new NextResponse(
      "Slack OAuth install is only available in multi-workspace mode.",
      {
        status: 400,
      },
    );
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return new NextResponse("SLACK_CLIENT_ID is not configured.", {
      status: 500,
    });
  }

  const state = randomUUID();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const redirectUri =
    process.env.SLACK_REDIRECT_URI ?? `${baseUrl}/api/slack/install/callback`;

  const installUrl = new URL("https://slack.com/oauth/v2/authorize");
  installUrl.searchParams.set("client_id", clientId);
  installUrl.searchParams.set("scope", BOT_SCOPES.join(","));
  installUrl.searchParams.set("redirect_uri", redirectUri);
  installUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(installUrl.toString(), 302);
  response.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/slack/install",
    maxAge: 60 * 10,
  });

  return response;
}
