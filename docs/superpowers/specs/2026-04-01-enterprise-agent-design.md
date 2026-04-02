# Kaizen Bot — Enterprise-Level Agent Upgrade

**Date:** 2026-04-01  
**Scope:** Single Slack workspace  
**Approach:** System Prompt + Agent Loop Overhaul (Approach B)

---

## Context

Kaizen Bot is a live, client-facing Slack CRM agent for a Dubai real estate team. The two primary pain points are:

- **Reliability (A):** Bot sometimes doesn't respond, acts on wrong data, loses thread context, or fails silently
- **AI Quality (C):** Wrong tool selection, vague responses, no Dubai RE context, poor tool chaining — root cause is the absence of a real system prompt

This spec covers the changes needed to fix both without schema migrations or new infrastructure.

---

## Architecture Overview

No new services or tables. Changes are confined to:

```
lib/
  system-prompt.ts     ← NEW: buildSystemPrompt(agent) function
  agent.ts             ← MODIFIED: context injection, timeout, error boundary, runId logging
  bot.ts               ← MODIFIED: init failure handling
app/
  api/webhooks/[platform]/route.ts  ← MODIFIED: idempotency guard
```

---

## Section 1 — System Prompt (`lib/system-prompt.ts`)

### Purpose
A `buildSystemPrompt(agent: Agent): string` function that returns the full system prompt string, injected per-request into the agent loop.

### Contents

**1. Identity & Role**
- Name: "Kaizen" — CRM assistant for a Dubai real estate team
- Knows the full lead pipeline: `new → contacted → qualified → negotiating → closed_won / closed_lost`
- Knows Dubai area names (Downtown, Marina, JBR, Business Bay, Palm Jumeirah, JVC, etc.)
- Formats budgets in AED (abbreviates millions: "AED 2.5M")
- Knows the current agent's name and role (injected at runtime)
- Knows the current UTC timestamp (injected at runtime)

**2. Tool Selection Rules**
Explicit per-tool guidance:
- `getMyLeads` — Use when agent asks for their lead list, pipeline overview, or "what do I have"
- `searchLeads` — Use when agent mentions a name, phone number, area, or budget range
- `getLeadDetail` — Use only after obtaining a lead ID; never guess an ID
- `createLead` — Use only when agent provides a full name AND at least one contact detail; ask for missing required fields before calling
- `updateLeadStatus` — Only after confirming lead name and new status explicitly; never assume
- `addNote` — Requires a confirmed lead ID; search first if unsure
- `searchProperties` — Use for "find me a property" or "what listings match" queries

**3. Tool Chaining Protocol**
Step-by-step rules for multi-step tasks:
- "Add a note to X" → search for X → if ambiguous, list matches and ask which one → then addNote
- "Move X to qualified" → search for X → confirm identity → updateLeadStatus
- "Create a lead for X" → ask for any missing required fields first → createLead → confirm creation

**4. Write Confirmation Rule**
Before calling `updateLeadStatus` or `createLead`, state what you're about to do:
> "I'll mark Ahmed Al Farsi as *qualified*. Confirming — shall I proceed?"

Exception: skip confirmation if the user's message contains unambiguous intent AND a full name match (e.g. "mark Ahmed Al Farsi as qualified").

**5. Response Format Rules**
- Lead lists: `• [Name] — [Status] — AED [Budget] — Last contact: [X days ago]`
- Note confirmations: `Note saved for [Name]: "[first 80 chars of note]..."`
- Status updates: `[Name] is now [new status].`
- Errors: plain English, never SQL or stack traces. E.g. "I couldn't find a lead with that name. Can you double-check the spelling?"
- Always address the agent by first name when known

**6. Behavioral Constraints**
- Never reveal tool names or internal implementation details to the user
- Never fabricate lead data — if a tool returns empty, say so
- If a tool returns an error, try once more before reporting the failure
- Stay focused on CRM tasks; politely redirect off-topic questions

### Runtime Injection
```typescript
export function buildSystemPrompt(agent: Agent): string {
  return `...static content...
  
You are assisting ${agent.full_name} (role: ${agent.role}).
Current time (UTC): ${new Date().toISOString()}
`;
}
```

---

## Section 2 — Agent Loop Hardening (`lib/agent.ts`)

### 1. System Prompt Injection
Replace any existing static prompt string with `buildSystemPrompt(agent)` called at the top of `runAgent`.

### 2. Thread State Read Timeout
```typescript
const threadStateResult = await Promise.race([
  supabase.from("thread_state").select(...).eq("thread_id", threadId).single(),
  new Promise((_, reject) => setTimeout(() => reject(new Error("thread_state timeout")), 3000))
]).catch((err) => {
  console.warn("agent:thread-state:timeout", { threadId, error: String(err) });
  return { data: null };
});
```
On timeout or error: log warning, continue with empty history. Bot responds rather than going silent.

### 3. Correlation Run ID
Each `runAgent` call generates a short run ID:
```typescript
const runId = Math.random().toString(36).slice(2, 10);
```
All `console.info/error/warn` calls within the run include `{ runId }`. Enables full request tracing in Vercel logs.

### 4. Unhandled Exception Boundary
```typescript
try {
  // existing agent logic
} catch (err) {
  console.error("agent:unhandled", { runId, error: String(err) });
  await thread.post("Something went wrong on my end. Please try again or contact your admin.");
}
```
Eliminates silent failures — the agent always posts something to Slack.

### 5. Tool Error Retry (System Prompt Driven)
The system prompt instructs the model: "If a tool returns `{ error }`, call it once more with corrected parameters before reporting the failure to the user." This leverages the LLM's own retry behavior without needing custom loop logic.

---

## Section 3 — Webhook Reliability

### `app/api/webhooks/[platform]/route.ts`

**Idempotency guard — Slack retry deduplication:**
```typescript
const retryNum = request.headers.get("x-slack-retry-num");
const retryReason = request.headers.get("x-slack-retry-reason");
if (retryNum && retryReason === "http_timeout") {
  console.info("webhook:slack:retry-skipped", { retryNum });
  return new Response("OK", { status: 200 });
}
```
Slack retries with `X-Slack-Retry-Reason: http_timeout` when the bot takes >3s. Without this guard, the bot processes duplicates and posts double responses.

### `lib/bot.ts`

**Init failure surfacing:**
```typescript
try {
  await ensureBotInitialized();
} catch (err) {
  console.error("bot:init:failed", { error: String(err) });
  return new Response("Service Unavailable", { status: 503 });
}
```
Currently a failed init crashes the request handler with a 500 and no useful log. This makes it visible and returns a proper status code.

---

## Files Modified / Created

| File | Change |
|------|--------|
| `lib/system-prompt.ts` | **NEW** — `buildSystemPrompt(agent)` |
| `lib/agent.ts` | Inject system prompt, add runId, thread state timeout, exception boundary |
| `lib/bot.ts` | Init failure → 503 with log |
| `app/api/webhooks/[platform]/route.ts` | Idempotency guard for Slack retries |

No schema migrations. No new environment variables. No new dependencies.

---

## Verification

1. **System prompt** — Ask the bot "what leads do I have?" in Slack. It should return a formatted list, not raw JSON or tool output.
2. **Tool chaining** — Say "add a note to Ahmed saying he's interested in Marina". Bot should search first, confirm, then add the note.
3. **Write confirmation** — Say "move X to negotiating" for an ambiguous name. Bot should ask which lead before acting.
4. **Silent failure fix** — Force a Supabase error (bad env var temporarily) and verify the bot posts the fallback message instead of going silent.
5. **Duplicate response fix** — Check Vercel logs after a slow response — should see `webhook:slack:retry-skipped` rather than two bot replies.
6. **Run ID tracing** — Check Vercel logs for any request — should see `runId` on every log line for that request.
