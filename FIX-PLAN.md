# Kaizen Bot — Fix Plan

## Context
Security audit identified 26 issues across 4 severity levels. The most critical are authorization bypasses that allow any agent to access/modify any other agent's leads. This plan addresses all findings — it serves as the implementation roadmap.

---

## Phase 1: Critical — Authorization & Data Isolation

### 1.1 Add ownership checks to all lead-read tools
- **Files:** `lib/tools/get-lead-detail.ts`, `lib/tools/search-leads.ts`
- **Fix:** Use the `agentId` parameter (currently ignored as `_agentId`) to filter queries by `assigned_to = agentId`. Remove the underscore prefix.
- **Scope:** Default to agent's own leads. Add an explicit `all_leads` boolean param (default false) for team-wide searches if needed.

### 1.2 Add ownership checks to all lead-write tools
- **Files:** `lib/tools/update-lead-status.ts`, `lib/tools/add-note.ts`
- **Fix:** Before any mutation, query the lead by `id` AND `assigned_to = agentId`. If no row returned, return `{ error: "Lead not found or not assigned to you" }`.

### 1.3 Enforce agent scoping in search
- **File:** `lib/tools/search-leads.ts`
- **Fix:** Always inject `assigned_to = agentId` into the query filter. Remove optional `assigned_to` param from caller-facing schema.

---

## Phase 2: High — Data Consistency & Error Handling

### 2.1 Check secondary DB operation errors
- **Files:** `lib/tools/add-note.ts`, `lib/tools/update-lead-status.ts`
- **Fix:** After each secondary insert/update (e.g., note insert after status change), check for errors. If the secondary op fails, return a partial-success error so the agent can report it.

### 2.2 Wrap multi-step mutations in a transaction
- **File:** `lib/tools/add-note.ts`
- **Fix:** Use Supabase's `rpc` or a Postgres function to wrap the note insert + `last_contacted_at` update in a single transaction.

### 2.3 Validate message history at runtime
- **File:** `lib/agent.ts`
- **Fix:** Replace bare `as CoreMessage[]` casts with a Zod schema that validates the shape. If validation fails, start with an empty history and log a warning. Remove the `as never` cast on the upsert by fixing the type generics.

### 2.4 Verify lead existence before mutation
- **Files:** `lib/tools/update-lead-status.ts`, `lib/tools/add-note.ts`
- **Fix:** Already covered by 1.2 — the ownership check query doubles as an existence check.

### 2.5 Log cron DM failures
- **File:** `app/api/cron/stale-leads/route.ts`
- **Fix:** Replace the empty `catch {}` block with `catch (e) { console.error("Failed to DM agent", agent.slack_user_id, e) }`.

### 2.6 Use constant-time comparison for cron auth
- **File:** `app/api/cron/stale-leads/route.ts`
- **Fix:** Replace `!==` string comparison with `crypto.timingSafeEqual` (Node built-in). Encode both strings to Buffer before comparing.

---

## Phase 3: Medium — Hardening

### 3.1 Fail fast on missing env vars
- **File:** `lib/supabase.ts`
- **Fix:** Remove fallback defaults. Throw an explicit error at import time if `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is undefined. Guard with `if (process.env.NODE_ENV !== 'production')` if build-time usage requires it.

### 3.2 Add max-length constraints to Zod schemas
- **File:** `lib/tools/index.ts`
- **Fix:** Add `.max(200)` to `full_name`, `.max(30)` to `phone`, `.max(2000)` to `content` / note text fields.

### 3.3 Make history cap configurable
- **File:** `lib/agent.ts`
- **Fix:** Extract `20` to a named constant `MAX_THREAD_HISTORY = 20` at the top of the file.

### 3.4 Add timeout to Slack DM calls in cron
- **File:** `app/api/cron/stale-leads/route.ts`
- **Fix:** Wrap each `bot.openDM()` + `bot.say()` call with `Promise.race` against a 5-second timeout. Log timeouts.

### 3.5 Use UTC explicitly for staleness calculation
- **File:** `app/api/cron/stale-leads/route.ts`
- **Fix:** Replace `new Date()` arithmetic with explicit UTC: `new Date(Date.now() - 7 * 86400000).toISOString()`.

---

## Phase 4: Low — Code Quality

### 4.1 Single source of truth for lead status enum
- **Fix:** Define the status list once in `types/index.ts` as a `const` array. Derive both the TypeScript type and Zod enum from it. Update `lib/tools/index.ts` to import from there.

### 4.2 Add basic structured logging
- **Fix:** Add `console.info` / `console.error` calls at tool entry/exit and on errors. No external logging library needed yet — just enough for Vercel's log viewer.

### 4.3 Remove boilerplate homepage
- **File:** `app/page.tsx`
- **Fix:** Replace with a minimal "Kaizen Bot is running" message or a 404/redirect.

---

## Implementation Order

| Step | Phase | Scope |
|------|-------|-------|
| 1 | 1.1–1.3 | Auth checks in 4 tool files |
| 2 | 2.6 | Timing-safe cron auth |
| 3 | 2.1–2.2 | Error handling + transaction |
| 4 | 2.3 | Runtime message validation |
| 5 | 2.5, 3.4 | Cron error logging + timeout |
| 6 | 3.1–3.2, 3.5 | Env vars, input limits, UTC |
| 7 | 4.1–4.3 | Code quality cleanup |

## Verification

- **After Phase 1:** Manually test via Slack that an agent cannot read/update leads assigned to another agent.
- **After Phase 2:** Simulate DB failures (e.g., invalid UUID) and confirm error messages propagate to Slack.
- **After Phase 3:** Deploy with missing env var and confirm immediate crash. Send oversized input and confirm rejection.
- **After all phases:** Full end-to-end Slack conversation test covering create, search, update, note, and cron job.
