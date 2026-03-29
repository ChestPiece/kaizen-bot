# Kaizen AI Agent — Phase 1 Implementation Plan

## Context

Kaizen is a Dubai real estate company that needs an internal Slack bot to help their agents manage leads. The core problem: deals are lost because agents forget to follow up. The solution is an AI agent that lives in Slack, understands natural language, reads/writes a Supabase CRM, and proactively alerts agents about stale leads every morning.

**Approach:** Chat SDK (Slack adapter) + Next.js App Router + GPT-4o function calling + Supabase. Scalable to other adapters (WhatsApp, Teams) later by adding adapter packages — no core logic changes.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ App Router, TypeScript |
| Chat platform | Chat SDK (`chat`) + `@chat-adapter/slack` |
| AI | OpenAI GPT-4o via Vercel AI SDK (`ai` package) |
| Database | Supabase (PostgreSQL) |
| Dev state | `@chat-adapter/state-memory` |
| Deployment | Vercel + Vercel Cron |

---

## Database Schema

### Migration file: `/supabase/migrations/001_initial_schema.sql`

Create in this order (FK dependency order):

1. **Enums**: `agent_role` (agent/manager/admin), `property_type` (residential/commercial), `lead_intent` (buy/rent/invest), `lead_status` (new/contacted/qualified/negotiating/closed_won/closed_lost)

2. **`agents`**: `id` uuid PK, `slack_user_id` text unique, `full_name` text, `email` text, `role` agent_role, `created_at` timestamptz

3. **`leads`**: `id` uuid PK, `full_name` text, `phone` text, `email` text nullable, `nationality` text, `property_type` property_type, `intent` lead_intent, `budget_aed` numeric, `preferred_areas` text[], `status` lead_status default 'new', `assigned_to` uuid FK→agents, `source` text, `last_contacted_at` timestamptz, `created_at` timestamptz

4. **`lead_notes`**: `id` uuid PK, `lead_id` uuid FK→leads, `content` text, `created_by` uuid FK→agents, `created_at` timestamptz

5. **`thread_state`**: `thread_id` text PK, `lead_id` uuid nullable, `agent_id` uuid FK→agents, `message_history` jsonb, `updated_at` timestamptz

6. **Indexes**: `leads(assigned_to)`, `leads(status)`, `leads(last_contacted_at)`, `lead_notes(lead_id)`, `agents(slack_user_id)`

---

## File Structure

```
kaizen-bot/
├── app/
│   └── api/
│       ├── webhooks/
│       │   └── [platform]/
│       │       └── route.ts        ← receives all Slack events
│       └── cron/
│           └── stale-leads/
│               └── route.ts        ← morning proactive alert
├── lib/
│   ├── bot.ts                      ← Chat SDK singleton
│   ├── agent.ts                    ← GPT-4o + tool calling + streaming
│   ├── supabase.ts                 ← Supabase client + getAgentBySlackId()
│   └── tools/
│       ├── index.ts                ← all tool definitions + executors map
│       ├── get-my-leads.ts
│       ├── search-leads.ts
│       ├── get-lead-detail.ts
│       ├── update-lead-status.ts
│       ├── add-note.ts
│       └── create-lead.ts
├── types/
│   └── index.ts                    ← shared TypeScript types (no runtime deps)
├── docs/
│   └── PLAN.md                     ← this file
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.local.example
└── vercel.json                     ← cron schedule config
```

---

## Implementation Status

| Step | File | Status |
|------|------|--------|
| 1 | `types/index.ts` | ✅ Done |
| 2 | `supabase/migrations/001_initial_schema.sql` | ✅ Done |
| 3 | `lib/supabase.ts` | ✅ Done |
| 4 | `lib/tools/get-my-leads.ts` | ✅ Done |
| 4 | `lib/tools/search-leads.ts` | ✅ Done |
| 4 | `lib/tools/get-lead-detail.ts` | ✅ Done |
| 4 | `lib/tools/update-lead-status.ts` | ✅ Done |
| 4 | `lib/tools/add-note.ts` | ✅ Done |
| 4 | `lib/tools/create-lead.ts` | ✅ Done |
| 5 | `lib/tools/index.ts` | ✅ Done |
| 6 | `lib/agent.ts` | ✅ Done |
| 7 | `lib/bot.ts` | ✅ Done |
| 8 | `app/api/webhooks/[platform]/route.ts` | ✅ Done |
| 9 | `app/api/cron/stale-leads/route.ts` | ✅ Done |
| 10 | `vercel.json` + `.env.local.example` | ✅ Done |

Status meaning:
- ✅ Done = implemented in code
- ✅ Validated = smoke checklist passed and build/test checks are green

Current phase gate:
- Phase 1 implementation: ✅ Done
- Phase 1 validation: ⏳ Pending smoke checklist and final build/test pass

---

## Implementation Order

Build in this exact sequence — each step depends on the previous:

### Step 1 — Types (`types/index.ts`)
Zero runtime dependencies. Define:
- Enums: `AgentRole`, `PropertyType`, `LeadIntent`, `LeadStatus`
- Interfaces: `Agent`, `Lead`, `LeadNote`, `ThreadState`, `LeadWithNotes`
- Tool arg interfaces: `GetMyLeadsArgs`, `SearchLeadsArgs`, `GetLeadDetailArgs`, `UpdateLeadStatusArgs`, `AddNoteArgs`, `CreateLeadArgs`

### Step 2 — Database migration
Apply `001_initial_schema.sql` to Supabase before writing any queries.

### Step 3 — Supabase client (`lib/supabase.ts`)
- Singleton `supabase` client using `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS for Phase 1)
- Export `getAgentBySlackId(slackUserId: string): Promise<Agent | null>` — used in both agent.ts and cron route

### Step 4 — Individual tool files (`lib/tools/*.ts`)
Each file exports one executor function: `(args, agentId) => Promise<result>`.

| Tool | Supabase operation | Side effects |
|---|---|---|
| `get-my-leads` | SELECT leads WHERE assigned_to=agentId, optional status filter | None. Sort by last_contacted_at ASC |
| `search-leads` | ilike on full_name + phone, chain .eq() filters | None. Limit 20 results |
| `get-lead-detail` | SELECT lead + join assigned agent + last 10 notes | None |
| `update-lead-status` | UPDATE leads SET status, last_contacted_at=now | Insert note in lead_notes if reason provided |
| `add-note` | INSERT lead_notes | UPDATE leads.last_contacted_at=now |
| `create-lead` | INSERT leads with assigned_to=agentId, status='new' | None |

### Step 5 — Tools index (`lib/tools/index.ts`)
Export Vercel AI SDK `tool()` objects using `ai` package. Pass agentId via `experimental_context` from streamText call.

**Critical:** Tool `description` strings drive GPT-4o accuracy. Written as intent-based, e.g. `"Use when agent asks about their pipeline or how many leads they have"`.

### Step 6 — Agent logic (`lib/agent.ts`)
Core `runAgent(params)` function:

1. Resolve caller: `getAgentBySlackId(slackUserId)` → return early if not found
2. Load thread history: SELECT from `thread_state` WHERE thread_id=threadId → default to `[]`
3. Build messages array: `[...history, { role: 'user', content: userMessage }]`
4. System prompt includes: agent name + role, today's date (Dubai timezone), CRM status definitions, instruction to never invent data
5. Call `streamText`, post result to thread
6. After stream: upsert `thread_state` with message history capped at 20

### Step 7 — Bot instance (`lib/bot.ts`)
Chat SDK singleton. Must be module-level — not inside a request handler.
- `onNewMention` → `thread.subscribe()` then `runAgent()`
- `onSubscribedMessage` → `runAgent()` directly (already subscribed)

### Step 8 — Webhook route (`app/api/webhooks/[platform]/route.ts`)
- `runtime = 'nodejs'` required (Slack SDK uses Node APIs)
- `after()` keeps the serverless function alive after HTTP response — critical for streaming

### Step 9 — Cron route (`app/api/cron/stale-leads/route.ts`)
- Auth: `Authorization: Bearer <CRON_SECRET>`
- Query: leads WHERE `last_contacted_at < now-7days` AND status NOT IN (closed_won, closed_lost)
- Group by assigned agent, send DM via `bot.openDM()`
- Message format: `"Good morning! You have N leads with no contact in 7+ days: • Name — Budget AED X, Status Y (last contact Z days ago)"`

### Step 10 — Vercel config
- `vercel.json`: cron `0 5 * * *` = 5am UTC = 9am GST (Dubai)
- `.env.local.example`: documents all 6 required env vars

---

## Environment Variables

| Variable | Used in | Notes |
|---|---|---|
| `SLACK_BOT_TOKEN` | `lib/bot.ts` | `xoxb-` prefix |
| `SLACK_SIGNING_SECRET` | `lib/bot.ts` | Verifies Slack requests |
| `OPENAI_API_KEY` | `lib/agent.ts` | Needs GPT-4o access |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts` | Safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase.ts` | Server-only, never NEXT_PUBLIC_ |
| `CRON_SECRET` | cron route | Generate (macOS/Linux): `openssl rand -hex 32`<br/>Generate (Windows PowerShell): `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')` |

---

## Key Architectural Decisions

- **Service role key (not RLS)** — simpler for Phase 1 while schema evolves. Add RLS in Phase 2.
- **Message history capped at 20** — bounds DB storage and GPT-4o latency. Real estate conversations are task-focused.
- **`maxSteps: 5`** — prevents runaway tool loops. Covers: search → detail → update → note → done.
- **`after()` for waitUntil** — critical for serverless. Without it, streaming is cut off when the HTTP response is sent.
- **`bot.openDM()` for cron** — morning alerts open fresh DMs. Agents can reply and trigger `onSubscribedMessage` naturally.
- **No properties table in Phase 1** — leads store preferred_areas as text[]. Properties entity added in Phase 2 once adoption is confirmed.

---

## Pre-requisite Setup (before running)

1. **Supabase**: Create project, note URL + service role key, apply migration
2. **Slack App**: Create at api.slack.com/apps
   - Bot scopes: `app_mentions:read`, `channels:history`, `im:history`, `im:write`, `chat:write`, `users:read`
   - Event subscriptions: `app_mention`, `message.channels`, `message.im`
3. **OpenAI**: API key with GPT-4o access
4. **Vercel**: Link repo, set env vars in dashboard
5. **ngrok**: For local dev webhook testing — point Slack event URL to `https://<ngrok-url>/api/webhooks/slack`

---

## End-to-End Test Sequence

1. Insert yourself into `agents` table with your Slack user ID
2. **Basic**: `@Kaizen show me my leads` → bot lists leads (or says none exist)
3. **Tool chaining**: `@Kaizen I just spoke with Ahmed, mark him as contacted and note he wants Downtown apartments` → 3 tool calls in sequence
4. **Create**: `@Kaizen add new lead — Mohammed Al Rashid, +971501234567, UAE national, buying residential in JBR, budget 3M` → GPT-4o parses and calls create_lead
5. **Memory**: `@Kaizen show my leads` → reply in same thread: `update the first one to qualified` → bot remembers context
6. **Cron**: Insert lead with last_contacted_at = 8 days ago, hit `GET /api/cron/stale-leads` with correct Authorization header → receive DM

### Smoke Checklist Before Production
- [ ] All 6 tools return correct Supabase data
- [ ] thread_state grows correctly (rows appear, cap at 20 messages works)
- [ ] Cron DM received correctly
- [ ] Unknown Slack user (not in agents table) handled gracefully
- [ ] Supabase errors caught in tools — return `{ error: string }` not throw, so GPT-4o can inform the user

---

## Phase 2 Ideas (post-adoption)

- Properties table with listings linked to leads
- WhatsApp adapter (`@chat-adapter/whatsapp`)
- Row-level security (RLS) in Supabase
- Manager dashboard — view all agent pipelines
- Analytics: conversion rates per agent, per area, per nationality
