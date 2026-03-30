# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
```

No test suite is configured.

## Architecture

Kaizen Bot is a **Slack-native AI CRM agent** for Dubai real estate teams. It responds to Slack mentions, uses GPT-4o to understand intent, calls tools to read/write Supabase, and replies in-thread.

### Request Flow

```
Slack message → /api/webhooks/slack → lib/bot.ts (Chat adapter)
  → lib/agent.ts (runAgent) → Vercel AI SDK streamText (GPT-4o)
    → lib/tools/*.ts (Zod-validated tool calls) → Supabase
  → streamed reply back to Slack thread
```

- `lib/bot.ts` — initializes the Slack Chat adapter; handles `onNewMention` and `onSubscribedMessage`
- `lib/agent.ts` — loads thread history from Supabase, runs `streamText` with tools, streams response, saves updated history (capped at 20 messages)
- `lib/tools/` — one file per CRM action (`create-lead`, `get-my-leads`, `get-lead-detail`, `search-leads`, `update-lead-status`, `add-note`). Each tool uses Zod for params and returns `{ error }` on failure so the agent can self-correct.
- `lib/supabase.ts` — typed Supabase client (service role key, bypasses RLS)
- `app/api/cron/stale-leads/route.ts` — Vercel Cron job (daily); DMs agents about leads untouched for 7+ days

### Data Model

| Table          | Purpose                              |
| -------------- | ------------------------------------ |
| `agents`       | Team members with Slack IDs          |
| `leads`        | CRM records with status pipeline     |
| `lead_notes`   | Interaction audit trail              |
| `thread_state` | Slack thread message history (JSONB) |

Lead status pipeline: `new → contacted → qualified → negotiating → closed_won / closed_lost`

### Key Patterns

- **Agent context** — `agentId` is injected via `experimental_context` and flows into tools for ownership scoping (agents see their own leads by default)
- **Tool-only DB access** — the agent never writes to the DB directly, only via defined tools
- **Cron auth** — `/api/cron/*` endpoints require `Authorization: Bearer <CRON_SECRET>`
- **Streaming** — uses `fullStream` from Vercel AI SDK to incrementally post to Slack

## Environment Variables

See `.env.local.example`. Required:

- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

For multi-workspace OAuth mode, use:

- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`
- Optional: `SLACK_ENCRYPTION_KEY`, `SLACK_REDIRECT_URI`, `NEXT_PUBLIC_APP_URL`

See `docs/SLACK_SETUP.md` for full setup, scopes, install/callback routes, and troubleshooting.
