# Slack Setup Guide

This guide documents production setup for the Kaizen Slack bot.

## Architecture Modes

### Single-workspace mode

Use this for one internal Slack workspace. Set:

- SLACK_AUTH_MODE=single
- SLACK_SIGNING_SECRET
- SLACK_BOT_TOKEN

### Multi-workspace OAuth mode

Use this when your app can be installed into multiple workspaces. Set:

- SLACK_AUTH_MODE=multi
- SLACK_SIGNING_SECRET
- SLACK_CLIENT_ID
- SLACK_CLIENT_SECRET
- Optional: SLACK_ENCRYPTION_KEY

Do not set SLACK_BOT_TOKEN at the same time as OAuth variables.

## Implemented Routes

- POST /api/webhooks/slack
- GET /api/slack/install
- GET /api/slack/install/callback

OAuth flow:

1. Open /api/slack/install.
2. Consent in Slack.
3. Slack redirects to /api/slack/install/callback.
4. Callback validates OAuth state, initializes bot, exchanges code, and stores installation.

## Slack App Manifest (baseline)

Use these bot scopes as a baseline:

- app_mentions:read
- channels:history
- channels:read
- chat:write
- groups:history
- groups:read
- im:history
- im:read
- im:write
- mpim:history
- mpim:read
- reactions:read
- reactions:write
- users:read

Event subscriptions should include:

- app_mention
- message.channels
- message.groups
- message.im
- message.mpim

Interactivity request URL should point to your webhook URL.

## Environment Variables

Required in all modes:

- SLACK_SIGNING_SECRET
- OPENAI_API_KEY
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- CRON_SECRET

Single-workspace only:

- SLACK_BOT_TOKEN

Multi-workspace OAuth only:

- SLACK_CLIENT_ID
- SLACK_CLIENT_SECRET

Optional:

- SLACK_ENCRYPTION_KEY
- NEXT_PUBLIC_APP_URL
- SLACK_REDIRECT_URI
- SLACK_AUTH_MODE (recommended for explicit mode control)

## Local Development

1. Run ngrok against your local app.
2. Set Slack Request URL to https://<ngrok-domain>/api/webhooks/slack.
3. For OAuth mode, set callback URL to https://<ngrok-domain>/api/slack/install/callback.
4. Run npm run dev.

## Troubleshooting

### Adapter not initialized during OAuth callback

Ensure callback route calls bot initialization before handleOAuthCallback.

### Invalid signature

Verify SLACK_SIGNING_SECRET and server clock sync.

### OAuth callback fails with missing code

Confirm Slack redirect URL exactly matches configured callback URL.

### Bot is silent in channel

Confirm event subscriptions are enabled and bot is added to the channel.

### Missing installation in multi-workspace mode

Re-run install flow for that workspace and verify callback completes.

## Security Checklist

- Keep secrets in server-only env vars.
- Enable SLACK_ENCRYPTION_KEY for OAuth token encryption at rest.
- Keep OAuth state validation enabled.
- Rotate Slack secrets on incident or staff offboarding.
- Add structured logs for webhook errors and OAuth failures.

## Current Limitation

Chat state persistence still uses in-memory state in this repository. For production-grade resilience across restarts, migrate to a persistent Chat SDK state adapter (Redis/Postgres).
