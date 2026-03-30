# Kaizen Bot

Kaizen Bot is a Slack-native AI CRM assistant for real estate teams.

It listens in Slack threads, uses GPT-4o with tool calls, and reads/writes lead data in Supabase.

## What it does

- Responds to mentions and subscribed thread messages.
- Runs CRM tools: create, search, and update leads, plus add notes.
- Sends daily stale-lead reminders with a cron route.

## Quick Start

1. Copy environment variables:

```bash
cp .env.local.example .env.local
```

2. Install dependencies:

```bash
npm install
```

3. Start local dev:

```bash
npm run dev
```

4. Expose your local app with ngrok and point Slack webhooks to:

```text
https://<your-ngrok-domain>/api/webhooks/slack
```

## Slack Setup

Full setup instructions, OAuth install flow, required scopes, env matrix, and troubleshooting are in:

- docs/SLACK_SETUP.md

## Key Routes

- POST /api/webhooks/[platform]
- GET /api/slack/install
- GET /api/slack/install/callback
- GET /api/cron/stale-leads

## Deployment Notes

- Runtime: Node.js route handlers.
- Cron auth uses Authorization: Bearer <CRON_SECRET>.
- Production should use persistent Chat SDK state storage.
