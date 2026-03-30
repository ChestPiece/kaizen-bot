
# Persistent State Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory Chat SDK state adapter with a PostgreSQL-backed adapter so thread subscriptions survive server restarts and Vercel cold starts.

**Architecture:** Swap `@chat-adapter/state-memory` for `@chat-adapter/state-pg` in `lib/bot.ts`. The pg adapter auto-reads a `DATABASE_URL` environment variable pointing at the existing Supabase PostgreSQL instance. No new infrastructure is needed — Supabase already provides the database; we just need its direct connection URL.

**Tech Stack:** `@chat-adapter/state-pg@4.23.0`, Supabase PostgreSQL (existing), Next.js Node.js runtime

---

## Why this matters

`createMemoryState()` stores Chat SDK thread subscription state in-process memory. On Vercel, every cold start (or multiple instances) starts with a blank slate — `onSubscribedMessage` handlers stop firing for threads that were subscribed in a previous invocation. Switching to `@chat-adapter/state-pg` persists subscriptions to the existing Supabase Postgres database.

---

## Files

| Action | File | Change |
|--------|------|--------|
| Modify | `lib/bot.ts` | Import `createPgState` instead of `createMemoryState`, swap the `state:` field |
| Modify | `package.json` | Add `@chat-adapter/state-pg`, remove `@chat-adapter/state-memory` |
| Modify | `.env.local.example` | Add `DATABASE_URL` entry with instructions |
| Modify | `.env` | Add actual `DATABASE_URL` value (Supabase transaction pooler URL) |

---

## Task 1: Install `@chat-adapter/state-pg` and remove `state-memory`

**Files:** `package.json`

- [ ] **Step 1: Install the pg adapter at the same version as other chat adapters**

```bash
cd /c/Users/Anas/Desktop/Development/Agents/kaizen-bot
npm install @chat-adapter/state-pg@4.23.0
```

Expected output: `added 1 package` (or similar). No errors.

- [ ] **Step 2: Remove the memory adapter**

```bash
npm uninstall @chat-adapter/state-memory
```

Expected output: `removed 1 package`. No errors.

- [ ] **Step 3: Verify package.json looks correct**

```bash
grep -E "state-(pg|memory)" package.json
```

Expected output (exactly one line):
```
    "@chat-adapter/state-pg": "^4.23.0",
```
`state-memory` must NOT appear.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace state-memory with state-pg for persistent thread subscriptions"
```

---

## Task 2: Add `DATABASE_URL` to environment files

Chat SDK's `createPgState()` auto-reads `DATABASE_URL` from `process.env`. You need the Supabase **transaction pooler** connection string (port 6543) — not the direct connection (port 5432) — because Vercel serverless functions open a new connection on every invocation and will exhaust the direct connection limit.

**How to get the URL from Supabase:**
1. Open your Supabase project dashboard
2. Go to **Project Settings → Database → Connection string**
3. Select **Transaction pooler** (Mode: Transaction)
4. Copy the URI — it looks like:
   `postgresql://postgres.YOURPROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres`

**Files:** `.env.local.example`, `.env`

- [ ] **Step 1: Add the placeholder to `.env.local.example`**

Add this block after the `SUPABASE_SERVICE_ROLE_KEY` line:

```
# PostgreSQL connection for Chat SDK persistent state (transaction pooler URL from Supabase dashboard)
# Project Settings → Database → Connection string → Transaction pooler (port 6543)
DATABASE_URL=postgresql://postgres.YOURPROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
```

- [ ] **Step 2: Add the real URL to `.env`**

Open `.env` and add (substituting your real Supabase transaction pooler URL):

```
DATABASE_URL=postgresql://postgres.YOURPROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
```

- [ ] **Step 3: Verify the env var is present**

```bash
grep DATABASE_URL .env
```

Expected: one line with your real URL. If it outputs nothing, you forgot to save.

- [ ] **Step 4: Commit the example file only (never commit `.env`)**

```bash
git add .env.local.example
git commit -m "docs: add DATABASE_URL to env example for Chat SDK pg state"
```

---

## Task 3: Update `lib/bot.ts` to use `createPgState`

**Files:** `lib/bot.ts`

- [ ] **Step 1: Replace the import**

In `lib/bot.ts`, change line 3:

```diff
-import { createMemoryState } from "@chat-adapter/state-memory";
+import { createPgState } from "@chat-adapter/state-pg";
```

- [ ] **Step 2: Replace the state adapter in the `Chat` constructor**

In `lib/bot.ts`, change the `state:` field inside `new Chat({...})` (currently around line 91):

```diff
 export const bot = new Chat({
   userName: "kaizen",
   adapters: {
     slack: slackAdapter,
   },
-  state: createMemoryState(),
+  state: createPgState(),
 });
```

`createPgState()` reads `DATABASE_URL` automatically — no arguments needed.

- [ ] **Step 3: Add a startup guard for the missing env var**

Add this block directly before the `export const slackAdapter = ...` line (around line 73), alongside the other env var guards:

```ts
if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing required environment variable: DATABASE_URL",
  );
}
```

- [ ] **Step 4: Verify the file compiles with no TypeScript errors**

```bash
cd /c/Users/Anas/Desktop/Development/Agents/kaizen-bot
npx tsc --noEmit
```

Expected: no output (clean). If there are errors, check that the import name is `createPgState` (not `createPostgresState` or similar) — confirm with:

```bash
node -e "const m = require('@chat-adapter/state-pg'); console.log(Object.keys(m))"
```

This prints the exported names. Use whichever matches `create*State` or `create*`.

- [ ] **Step 5: Do a full build to confirm no bundling issues**

```bash
npm run build
```

Expected: build completes, no errors. Warnings about bundle size are fine.

- [ ] **Step 6: Commit**

```bash
git add lib/bot.ts
git commit -m "feat: use persistent PostgreSQL state adapter for Chat SDK thread subscriptions"
```

---

## Verification

After all three tasks, run:

```bash
npm run dev
```

Then in a separate terminal:

```bash
# Confirm DATABASE_URL is being picked up — the server should start without throwing
curl http://localhost:3000/
```

Expected: HTTP 200 with "Kaizen Bot is running." If you see `Error: Missing required environment variable: DATABASE_URL`, the env var isn't loaded — check that `.env` (not `.env.local`) exists and has the value, or rename it to `.env.local`.

To confirm thread subscriptions persist across restarts:
1. @mention the bot in Slack — it should subscribe to the thread
2. Kill and restart the dev server (`Ctrl+C`, `npm run dev`)
3. Reply in the same thread — `onSubscribedMessage` should fire and the bot should respond

If the bot doesn't respond after restart, the state adapter isn't persisting. Check Supabase logs for connection errors.
