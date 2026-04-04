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

if (!SLACK_SIGNING_SECRET) {
  throw new Error(
    "Missing required environment variable: SLACK_SIGNING_SECRET",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL");
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

export const bot = new Chat({
  userName: "kaizen",
  adapters: {
    slack: slackAdapter,
  },
  state: createPostgresState(),
  concurrency: "queue",   // queue follow-up messages instead of dropping them during long tool loops
  dedupeTtlMs: 300_000,   // explicit 5-min dedup window (matches SDK default)
});

let initializationPromise: Promise<void> | null = null;

export function ensureBotInitialized(): Promise<void> {
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
        initializationPromise = null;
        throw error;
      });
  }

  return initializationPromise;
}

bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await runAgent({
    userMessage: message.text,
    slackUserId: message.author.userId,
    threadId: thread.id,
    thread,
  });
});

bot.onSubscribedMessage(async (thread, message) => {
  await runAgent({
    userMessage: message.text,
    slackUserId: message.author.userId,
    threadId: thread.id,
    thread,
  });
});
