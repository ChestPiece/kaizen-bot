# Discord Implementation Plan

## Context

Kaizen Bot currently runs as a Slack-only AI CRM agent. The goal is to add Discord as a second platform so the same GPT-4o agent (with all its CRM tools) can be invoked from Discord servers via @mention, using the Chat SDK's `@chat-adapter/discord` package which is already installed. The webhook route `/api/webhooks/[platform]` already handles multi-platform routing — Discord slots in cleanly.

The two non-trivial problems to solve:
1. **agentId resolution** — currently `runAgent` receives a `slackUserId` and resolves it via `getAgentBySlackId()`. Discord users have different IDs; the `agents` DB table has no `discord_user_id` column.
2. **Gateway listener** — Discord uses a WebSocket (not HTTP push) for message delivery. A cron job must restart the listener periodically to keep it alive on Vercel's serverless environment.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/migrations/004_discord_users.sql` | New — add `discord_user_id` column to `agents` |
| `lib/agent.ts` | Modify — platform-agnostic `runAgent`, add Discord user lookup |
| `lib/bot.ts` | Modify — add Discord adapter + conditional init |
| `app/api/cron/discord-gateway/route.ts` | New — cron endpoint to keep Gateway WS alive |
| `vercel.json` | Modify — add `*/9 * * * *` cron for Gateway |
| `.env.local.example` | Modify — add three Discord env vars |

---

## Step 1 — DB Migration

**`supabase/migrations/004_discord_users.sql`**

```sql
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS discord_user_id TEXT UNIQUE;
```

Nullable, unique. Agents register their Discord user ID so the bot can map incoming messages to CRM agent profiles. Apply to staging first, then production.

---

## Step 2 — Make `runAgent` Platform-Agnostic (`lib/agent.ts`)

### Current signature (lines 173–178)
```typescript
async function runAgent({
  userMessage, slackUserId, threadId, thread
}: RunAgentParams)
```

### Changes

**2a. Update `RunAgentParams` type:**
```typescript
type RunAgentParams = {
  userMessage: string;
  userId: string;          // platform-specific raw user ID
  platform: "slack" | "discord";
  threadId: string;
  thread: Thread;
};
```

**2b. Add Discord lookup function** (after `getAgentBySlackId`):
```typescript
async function getAgentByDiscordId(discordUserId: string) {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("discord_user_id", discordUserId)
    .single();
  if (error) throw error;
  return data;
}
```

**2c. Update lookup routing in `runAgent`** (replacing the `getAgentBySlackId` call):
```typescript
const agent =
  platform === "discord"
    ? await getAgentByDiscordId(userId)
    : await getAgentBySlackId(userId);
```

Keep the existing "agent not found" early-return guard — it works for both platforms.

**2d. Rename `slackUserId` → `userId`, add `platform`. Update call sites in `bot.ts`.**

---

## Step 3 — Add Discord Adapter to `lib/bot.ts`

### 3a. Add import
```typescript
import { createDiscordAdapter } from "@chat-adapter/discord";
```

### 3b. Conditionally build adapters object (after existing Slack adapter setup)

```typescript
const adapters: Record<string, unknown> = { slack: slackAdapter };

if (process.env.DISCORD_BOT_TOKEN) {
  adapters.discord = createDiscordAdapter();
  // Auto-reads DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY from env
}
```

### 3c. Pass `adapters` into `new Chat({ ... })` — replace the hardcoded `{ slack: slackAdapter }`.

### 3d. Update event handlers to detect platform from `thread.id`

The existing `onNewMention` and `onSubscribedMessage` handlers fire for all platforms. Update the `runAgent` call inside each:

```typescript
bot.onNewMention(async (thread, message) => {
  const platform = thread.id.startsWith("discord:") ? "discord" : "slack";
  await withThreadLock(thread.id, () =>
    runAgent({
      userMessage: message.text ?? "",
      userId: message.author.id,
      platform,
      threadId: thread.id,
      thread,
    })
  );
});
```

Same pattern for `onSubscribedMessage`. The `withThreadLock` wrapper is unchanged — it keys on `thread.id` which is unique per platform.

### 3e. Export `bot` instance

The cron route needs it. Add `export { bot }` to `lib/bot.ts`.

---

## Step 4 — Discord Gateway Cron (`app/api/cron/discord-gateway/route.ts`)

Discord doesn't push events via HTTP like Slack. `startGatewayListener()` opens a WebSocket that listens for messages and forwards them to `/api/webhooks/discord`. On Vercel serverless, this must be restarted periodically.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ensureBotInitialized, bot } from "@/lib/bot";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ skipped: true });
  }

  await ensureBotInitialized();
  const discord = bot.getAdapter("discord");
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/discord`;
  const durationMs = 9 * 60 * 1000; // 9 minutes — matches cron interval

  after(
    discord.startGatewayListener(
      { waitUntil: (t) => after(t) },
      durationMs,
      undefined,
      webhookUrl
    )
  );

  return NextResponse.json({ started: true });
}
```

---

## Step 5 — `vercel.json` Cron Entry

Add to the `crons` array:
```json
{
  "path": "/api/cron/discord-gateway",
  "schedule": "*/9 * * * *"
}
```

---

## Step 6 — `.env.local.example`

Add under the optional section:
```
# Discord (optional — omit to disable Discord support)
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
```

---

## Discord Developer Portal Setup (User Actions After Deploy)

1. Create a Discord Application at discord.com/developers
2. Add a Bot, enable **Message Content Intent** and **Server Members Intent**
3. Set **Interactions Endpoint URL** to `https://kaizen-bot-one.vercel.app/api/webhooks/discord`
4. Copy Bot Token → `DISCORD_BOT_TOKEN`, App ID → `DISCORD_APPLICATION_ID`, Public Key → `DISCORD_PUBLIC_KEY`
5. Invite bot to server with scopes: `bot`, `applications.commands` + permissions: Send Messages, Read Message History, Add Reactions, Use Slash Commands
6. Run the SQL migration on production Supabase, then set each agent's `discord_user_id` via the Supabase dashboard

---

## Verification

1. **Local**: `npm run dev` + ngrok → set Discord Interactions Endpoint URL → @mention bot in a Discord channel → confirm agent responds in thread
2. **Gateway**: Hit `GET /api/cron/discord-gateway` with `Authorization: Bearer <CRON_SECRET>` → confirm `startGatewayListener` fires → send a Discord message and verify it arrives at the webhook
3. **Slack unchanged**: Confirm existing Slack flow still works after `bot.ts` adapters change
4. **agentId resolution**: Discord user with mapped `discord_user_id` gets correct CRM data; unmapped user gets the "agent not found" error message
