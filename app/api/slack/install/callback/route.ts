import { NextResponse } from "next/server";
import { ensureBotInitialized, slackAdapter, slackMode } from "@/lib/bot";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (slackMode !== "multi-workspace") {
    return new NextResponse(
      "Slack OAuth callback is only available in multi-workspace mode.",
      {
        status: 400,
      },
    );
  }

  const url = new URL(request.url);
  const requestState = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("slack_oauth_state="))
    ?.split("=")[1];

  if (!requestState || !cookieState || requestState !== cookieState) {
    return new NextResponse("Invalid OAuth state. Please retry installation.", {
      status: 400,
    });
  }

  try {
    await ensureBotInitialized();
    const callbackUrl = new URL(request.url)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? callbackUrl.origin
    const redirectUri = process.env.SLACK_REDIRECT_URI ?? `${baseUrl}/api/slack/install/callback`
    callbackUrl.searchParams.set('redirect_uri', redirectUri)

    const callbackRequest = new Request(callbackUrl.toString(), request)
    const { teamId } = await slackAdapter.handleOAuthCallback(callbackRequest)

    const response = new NextResponse(
      `Slack app installed for team ${teamId}. You can now return to Slack.`,
      {
        status: 200,
      },
    );
    response.cookies.set("slack_oauth_state", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/slack/install",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("[slack/install/callback] OAuth installation failed", error);
    return new NextResponse(
      "Slack OAuth installation failed. Check server logs for details.",
      {
        status: 500,
      },
    );
  }
}
