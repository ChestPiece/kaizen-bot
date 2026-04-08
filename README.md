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

5. Build the local code-review graph:

```bash
python -m code_review_graph build
```

6. Check graph status:

```bash
python -m code_review_graph status
```

Note: `python -m code_review_graph serve` is the MCP stdio server command and should be launched by your editor/tool host, not run manually in an interactive terminal.

7. Validate DB + vector search health:

```bash
npx tsx scripts/health-check.ts
```

8. If health check reports missing lead embeddings, run a safe dry-run backfill:

```bash
npx tsx scripts/backfill-lead-embeddings.ts
```

Then apply writes:

```bash
npx tsx scripts/backfill-lead-embeddings.ts --apply
```

## Slack Setup

Full setup instructions, OAuth install flow, required scopes, env matrix, and troubleshooting are in:

- docs/SLACK_SETUP.md
- docs/CODE_REVIEW_GRAPH.md

## Key Routes

- POST /api/webhooks/[platform]
- GET /api/slack/install
- GET /api/slack/install/callback
- GET /api/cron/stale-leads

## Deployment Notes

- Runtime: Node.js route handlers.
- Cron auth uses Authorization: Bearer <CRON_SECRET>.
- Chat SDK state is persisted in PostgreSQL via `DATABASE_URL`.
