import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-pg";
import { runAgent } from "./agent";
import { toLogError } from "./safe-error";

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SLACK_ENCRYPTION_KEY,
  SLACK_AUTH_MODE,
} = process.env;
const databaseUrl = process.env.DATABASE_URL;

if (!SLACK_SIGNING_SECRET) {
  throw new Error(
    "Missing required environment variable: SLACK_SIGNING_SECRET",
  );
}

if (!databaseUrl) {
  throw new Error("Missing required environment variable: DATABASE_URL");
}

if (!/:6543(?:\/|$)/.test(databaseUrl)) {
  const detectedPort = databaseUrl.match(/:(\d+)(?:\/|$)/)?.[1] ?? "unknown";
  throw new Error(
    `DATABASE_URL must use the Supabase transaction pooler on port 6543. Detected port: ${detectedPort}.`,
  );
}

const hasSingleWorkspaceConfig = Boolean(SLACK_BOT_TOKEN);
const hasMultiWorkspaceConfig = Boolean(SLACK_CLIENT_ID || SLACK_CLIENT_SECRET);

if (
  SLACK_AUTH_MODE &&
  SLACK_AUTH_MODE !== "single" &&
  SLACK_AUTH_MODE !== "multi"
) {
  throw new Error('Invalid SLACK_AUTH_MODE. Use "single" or "multi".');
}

if (SLACK_AUTH_MODE === "single" && !hasSingleWorkspaceConfig) {
  throw new Error("SLACK_AUTH_MODE=single requires SLACK_BOT_TOKEN.");
}

if (SLACK_AUTH_MODE === "multi" && (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET)) {
  throw new Error(
    "SLACK_AUTH_MODE=multi requires SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.",
  );
}

if (
  !SLACK_AUTH_MODE &&
  hasMultiWorkspaceConfig &&
  (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET)
) {
  throw new Error(
    "Incomplete multi-workspace Slack auth configuration: SLACK_CLIENT_ID and SLACK_CLIENT_SECRET are both required.",
  );
}

if (!SLACK_AUTH_MODE && !hasSingleWorkspaceConfig && !hasMultiWorkspaceConfig) {
  throw new Error(
    "Missing Slack auth configuration: set SLACK_BOT_TOKEN for single-workspace mode, or SLACK_CLIENT_ID + SLACK_CLIENT_SECRET for multi-workspace OAuth mode.",
  );
}

if (!SLACK_AUTH_MODE && hasSingleWorkspaceConfig && hasMultiWorkspaceConfig) {
  console.warn(
    "Both single and multi-workspace Slack credentials are set. Defaulting to multi-workspace OAuth mode. Set SLACK_AUTH_MODE to choose explicitly.",
  );
}

export const slackMode =
  SLACK_AUTH_MODE === "single"
    ? "single-workspace"
    : SLACK_AUTH_MODE === "multi"
      ? "multi-workspace"
      : hasMultiWorkspaceConfig
        ? "multi-workspace"
        : "single-workspace";

export const slackAdapter =
  slackMode === "single-workspace"
    ? createSlackAdapter({
        botToken: SLACK_BOT_TOKEN!,
        signingSecret: SLACK_SIGNING_SECRET,
      })
    : createSlackAdapter({
        signingSecret: SLACK_SIGNING_SECRET,
        clientId: SLACK_CLIENT_ID!,
        clientSecret: SLACK_CLIENT_SECRET!,
        encryptionKey: SLACK_ENCRYPTION_KEY,
      });

const adapters: Record<string, ReturnType<typeof createSlackAdapter>> = {
  slack: slackAdapter,
};

export const bot = new Chat({
  userName: "kaizen",
  adapters,
  state: createPostgresState({ url: databaseUrl }),
  concurrency: "queue",   // queue follow-up messages instead of dropping them during long tool loops
  dedupeTtlMs: 300_000,   // explicit 5-min dedup window (matches SDK default)
});

const threadLocks = new Map<string, Promise<void>>();

async function withThreadLock(
  threadId: string,
  task: () => Promise<void>,
): Promise<void> {
  const previous = threadLocks.get(threadId) ?? Promise.resolve();

  const current = previous
    .catch(() => undefined)
    .then(task)
    .catch((error) => {
      console.error("bot:thread-lock:error", {
        threadId,
        error: toLogError(error),
      });
      throw error;
    });

  threadLocks.set(threadId, current);

  try {
    await current;
  } finally {
    if (threadLocks.get(threadId) === current) {
      threadLocks.delete(threadId);
    }
  }
}

let initializationPromise: Promise<void> | null = null;
let lastInitializationErrorAt = 0;
const INIT_RETRY_COOLDOWN_MS = 5000;

export function ensureBotInitialized(): Promise<void> {
  if (
    !initializationPromise &&
    lastInitializationErrorAt > 0 &&
    Date.now() - lastInitializationErrorAt < INIT_RETRY_COOLDOWN_MS
  ) {
    throw new Error("Bot initialization recently failed. Retry shortly.");
  }

  if (!initializationPromise) {
    console.info("bot:init:start", { slackMode });
    initializationPromise = bot
      .initialize()
      .then(() => {
        console.info("bot:init:success", { slackMode });
      })
      .catch((error) => {
        console.error("bot:init:error", {
          slackMode,
          error: toLogError(error),
        });
        lastInitializationErrorAt = Date.now();
        initializationPromise = null;
        throw error;
      });
  }

  return initializationPromise;
}

bot.onNewMention(async (thread, message) => {
  const platform = "slack";
  await thread.subscribe();
  await withThreadLock(thread.id, async () => {
    await runAgent({
      userMessage: message.text ?? "",
      userId: message.author.userId,
      platform,
      threadId: thread.id,
      thread,
    });
  });
});

bot.onSubscribedMessage(async (thread, message) => {
  const platform = "slack";
  await withThreadLock(thread.id, async () => {
    await runAgent({
      userMessage: message.text ?? "",
      userId: message.author.userId,
      platform,
      threadId: thread.id,
      thread,
    });
  });
});
