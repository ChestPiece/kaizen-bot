# CLAUDE.md

Read this entire file before touching anything. This is the source of truth
for how Kaizen Bot is built, how it should be extended, and what you must
never do.

@AGENTS.md

---

## What This Is

Kaizen Bot is a Slack-native AI CRM agent for a Dubai real estate company.
Real estate agents @mention it in Slack, describe what they need in plain
English, and the bot reads or writes their CRM data in response.

The agent runs on GPT-4o via Vercel AI SDK. The Slack integration is handled
by Vercel's Chat SDK. All database access goes through typed tool calls —
never raw queries. It is deployed on Vercel and is a live client-facing
production system.

---

## Running the Project
```bash
npm run dev      # development server
npm run build    # production build
npm start        # start production server
```

No automated test suite. Test changes manually via ngrok + a real Slack
workspace before considering anything done.

---

## How a Message Becomes a Response
```
User @mentions bot in Slack
  → POST /api/webhooks/[platform]
  → lib/bot.ts          Chat SDK adapter, fires onNewMention or onSubscribedMessage
  → lib/agent.ts        Loads thread history, creates ToolLoopAgent, streams response
  → lib/tools/index.ts  Tool registry — all DB reads and writes happen here, nowhere else
  → Supabase            Postgres via service role client
  → Streamed reply posted back to the Slack thread
```

This flow does not change. If you are tempted to shortcut any step — add a
raw query in agent.ts, call Supabase directly from bot.ts — don't.

---

## File Structure
```
app/
  api/
    webhooks/[platform]/  Generic webhook router — routes Slack events to bot.ts
    slack/
      install/            OAuth start — redirects to Slack authorize URL
      install/callback/   OAuth callback — exchanges code for bot token
    cron/stale-leads/     Daily Vercel Cron job — DMs agents about stale leads
lib/
  bot.ts                  Chat SDK Slack adapter setup (single + multi-workspace)
  agent.ts                Core agent loop — ToolLoopAgent orchestration
  supabase.ts             Typed Supabase client using service role key
  embeddings.ts           OpenAI text-embedding-3-small (1536-dim) helpers
  tools/
    index.ts              Tool registry and Zod schema definitions
    create-lead.ts
    get-my-leads.ts
    get-lead-detail.ts
    search-leads.ts
    update-lead-status.ts
    add-note.ts
    search-properties.ts  Vector similarity search via pgvector RPC
types/
  index.ts                All TypeScript interfaces, enums, and DB row types
supabase/
  migrations/             SQL migration files (001 base schema, 002 RPC, 003 pgvector)
docs/
  SLACK_SETUP.md          Slack app config, scopes, OAuth, troubleshooting
```

---

## Database Tables

| Table              | What It Holds                                          |
|--------------------|--------------------------------------------------------|
| `agents`           | Team members and their Slack user IDs                  |
| `leads`            | CRM records moving through the status pipeline         |
| `lead_notes`       | Per-lead interaction history                           |
| `thread_state`     | Slack thread message history stored as JSONB           |
| `properties`       | Property listings with pgvector embeddings (migration 003) |
| `lead_embeddings`  | Per-lead semantic embeddings for similarity search (migration 003) |

Lead status pipeline:
`new → contacted → qualified → negotiating → closed_won / closed_lost`

Database functions (RPCs):
- `add_lead_note_and_touch_lead` — atomically inserts note + updates `last_contacted_at`
- `match_properties(query_embedding, match_count, filter_status, filter_intent)` — vector similarity search on properties
- `match_leads(query_embedding, match_count)` — vector similarity search on leads

---

## How the Agent Works

**Ownership scoping.** Every tool receives `agentId` via
`experimental_context`. By default, agents see their own leads. Tools must
respect this — do not return other agents' data unless the query explicitly
asks for it and the logic supports it.

**Tool-only DB access.** `agent.ts` never calls Supabase directly. If a
required operation has no tool, create one. The file is
`lib/tools/<name>.ts`, registered in `lib/tools/index.ts` (which `agent.ts` imports).

**Thread history.** Loaded at the start of each `runAgent` call, capped at
20 messages, saved after the stream completes. Do not change this cap without
a good reason.

**Streaming.** Uses `fullStream` from Vercel AI SDK. Chat SDK handles posting
chunks incrementally to the Slack thread. Do not buffer the full response
before posting.

**Cron auth.** Every `/api/cron/*` route checks
`Authorization: Bearer <CRON_SECRET>`. This check stays. Always.

---

## Security — These Rules Do Not Bend

**No sensitive data in logs.**
Do not log API keys, tokens, Supabase URLs, email addresses, phone numbers,
or lead contact details. Use labels like `[REDACTED]` or `agentId: xyz`.
Real values stay out of logs entirely.

**No hardcoded credentials.**
Every secret comes from `process.env`. If you need a new variable, add it to
`.env.local.example` with a placeholder. Never put real values there.
Never commit `.env.local` or `.env` — both are gitignored for a reason.

**Service role key is server-only.**
`lib/supabase.ts` uses the service role key. It may only be imported in
server-side files — `lib/` and `app/api/`. Never in client components or
pages. If you find yourself typing this import somewhere else, stop.

**No raw DB errors reaching Slack.**
Tools return `{ error: "..." }` with a clean, generic message. Log the
actual Supabase error server-side. The agent gets enough to self-correct,
not a stack trace or SQL fragment.

**No cron bypasses.**
The `CRON_SECRET` check is not optional in development. Do not add shortcuts.

---

## Adding a New Tool

1. Create `lib/tools/<tool-name>.ts`
2. Define input params with a Zod schema
3. Implement the function — Supabase via `lib/supabase.ts` only
4. On any failure, return `{ error: "descriptive message" }` and log the
   real error server-side
5. Register it in `lib/tools/index.ts` (the `tools` export object)
6. Keep business logic in the tool file, not in `agent.ts` or `index.ts`
7. Follow the logging pattern: `console.info("tool:<name>:start", { agentId, ... })`

---

## Changing the Schema

1. Write the migration as a `.sql` file under `supabase/migrations/`
2. Test against staging before production
3. Never run DROP or column removal without explicit confirmation
4. If adding a table, update the Database Tables section above

---

## Error Handling

Every tool handles its own errors. Nothing throws uncaught. The agent retries
once on `{ error }` before telling the user something went wrong. Stack
traces, SQL errors, and Supabase client errors never reach Slack.

---

## Environment Variables

Full list in `.env.local.example`. Minimum required to run:
```
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
OPENAI_API_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL          # PostgreSQL connection string — used by Chat SDK for thread state
CRON_SECRET
```

Optional:
```
OPENAI_MODEL          # Defaults to gpt-4o if unset
SLACK_AUTH_MODE       # "single" or "multi" — inferred from env vars if unset
```

Multi-workspace OAuth (required when SLACK_AUTH_MODE=multi):
```
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
SLACK_ENCRYPTION_KEY
SLACK_REDIRECT_URI
NEXT_PUBLIC_APP_URL
```

See `docs/SLACK_SETUP.md` for the full Slack app setup.

---

## Before You Write Any Code

- Read the relevant files first. Do not assume structure from this doc alone.
- Schema changes need a written migration plan and approval before execution.
- If the task is ambiguous, ask one question. Do not guess and build.
- New env variables go in `.env.local.example` with placeholder values.
- After any significant change, summarize: what changed, which files were
  modified, what the user needs to do next (run migration, redeploy, update
  env, etc.).

---

## Deployment

Deployed on **Vercel**. Slack webhook URL is the Vercel deployment URL +
`/api/webhooks/slack`. Cron schedule lives in `vercel.json`. Do not modify
the cron schedule without checking with the project owner first.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes -> gives risk-scored analysis |
| `get_review_context` | Need source snippets for review -> token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
