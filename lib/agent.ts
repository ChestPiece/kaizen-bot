import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent } from "ai";
import type { ModelMessage } from "ai";
import type { Thread } from "chat";
import { z } from "zod";
import { supabase, getAgentByDiscordId, getAgentBySlackId } from "./supabase";
import { tools } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import { toLogError } from "./safe-error";
import type { CoreMessage } from "@/types";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing required environment variable: OPENAI_API_KEY");
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";
const MAX_THREAD_HISTORY = 20;
const THREAD_STATE_TIMEOUT_MS = 5000;
const THREAD_STATE_MAX_ATTEMPTS = 3;
const THREAD_STATE_RETRY_BASE_DELAY_MS = 250;

const CoreMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.union([z.string(), z.array(z.unknown())]),
});

const MessageHistorySchema = z.array(CoreMessageSchema);

const ThreadStateSchema = z.object({
  message_history: MessageHistorySchema,
});

function sanitizeForLog(input: unknown): unknown {
  if (typeof input === "string") {
    return input.length > 300 ? `${input.slice(0, 300)}...` : input;
  }

  if (Array.isArray(input)) {
    return input.slice(0, 10).map((item) => sanitizeForLog(item));
  }

  if (input && typeof input === "object") {
    const entries = Object.entries(input as Record<string, unknown>).slice(
      0,
      20,
    );
    return Object.fromEntries(
      entries.map(([key, value]) => [key, sanitizeForLog(value)]),
    );
  }

  return input;
}

interface RunAgentParams {
  userMessage: string;
  userId: string;
  platform: "slack" | "discord";
  threadId: string;
  thread: Thread;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableThreadStateError(err: unknown): boolean {
  const message = String(toLogError(err));
  return /(timeout|timed out|etimedout|econnreset|enotfound|eai_again|network|connect)/i.test(
    message,
  );
}

async function fetchThreadStateOnce(threadId: string): Promise<unknown> {
  const { data, error } = await supabase
    .from("thread_state")
    .select("message_history")
    .eq("thread_id", threadId)
    .single();

  if (error) {
    // PGRST116 = no rows found
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

async function loadThreadStateWithRetry(
  threadId: string,
  runId: string,
): Promise<unknown> {
  for (let attempt = 1; attempt <= THREAD_STATE_MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();

    try {
      const rawThreadState = await Promise.race([
        fetchThreadStateOnce(threadId),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("thread_state timeout")),
            THREAD_STATE_TIMEOUT_MS,
          ),
        ),
      ]);

      console.info("agent:thread-state:load:success", {
        runId,
        threadId,
        attempt,
        durationMs: Date.now() - startedAt,
        hasData: Boolean(rawThreadState),
      });
      return rawThreadState;
    } catch (err) {
      const retryable = isRetryableThreadStateError(err);
      console.warn("agent:thread-state:load:failed", {
        runId,
        threadId,
        attempt,
        retryable,
        error: toLogError(err),
      });

      if (!retryable || attempt === THREAD_STATE_MAX_ATTEMPTS) {
        return null;
      }

      await sleep(THREAD_STATE_RETRY_BASE_DELAY_MS * attempt);
    }
  }

  return null;
}

async function persistThreadHistory(
  threadId: string,
  agentId: string,
  messageHistory: CoreMessage[],
  runId: string,
): Promise<void> {
  const startedAt = Date.now();

  const { error } = await supabase.from("thread_state").upsert({
    thread_id: threadId,
    agent_id: agentId,
    message_history: messageHistory,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("agent:thread-state:upsert:error", {
      runId,
      threadId,
      agentId,
      error: toLogError(error),
    });
    return;
  }

  console.info("agent:thread-state:upsert:success", {
    runId,
    threadId,
    agentId,
    durationMs: Date.now() - startedAt,
    messageCount: messageHistory.length,
  });
}

export async function runAgent({
  userMessage,
  userId,
  platform,
  threadId,
  thread,
}: RunAgentParams) {
  const runId = Math.random().toString(36).slice(2, 10);

  try {
    const agent =
      platform === "discord"
        ? await getAgentByDiscordId(userId)
        : await getAgentBySlackId(userId);

    if (!agent) {
      console.warn("agent:no-profile", { runId, userId, platform });
      await thread.post(
        (async function* () {
          yield {
            type: "text-delta",
            textDelta:
              "Sorry, I couldn't find your agent profile. Please ask your admin to add you to the system.",
          };
        })(),
      );
      return;
    }

    console.info("agent:run:start", { runId, agentId: agent.id, threadId });

    const rawThreadState = await loadThreadStateWithRetry(threadId, runId);

    const parsedThreadState = ThreadStateSchema.safeParse(rawThreadState);
    if (!parsedThreadState.success && rawThreadState) {
      console.warn("agent:history:invalid", {
        runId,
        threadId,
        issues: parsedThreadState.error.issues,
        rawThreadState: sanitizeForLog(rawThreadState),
      });
    }

    const history: CoreMessage[] = parsedThreadState.success
      ? parsedThreadState.data.message_history
      : [];

    const messages: CoreMessage[] = [
      ...history,
      { role: "user", content: userMessage },
    ];

    const agentModel = new ToolLoopAgent({
      model: openai(OPENAI_MODEL),
      instructions: buildSystemPrompt(agent),
      tools,
      experimental_context: { agentId: agent.id },
    });

    const result = await agentModel.stream({
      messages: messages as ModelMessage[],
    });

    await thread.startTyping();

    const streamStartedAt = Date.now();
    console.info("agent:stream:start", { runId, threadId, agentId: agent.id });
    try {
      await thread.post(result.fullStream);
      console.info("agent:stream:complete", {
        runId,
        threadId,
        agentId: agent.id,
        durationMs: Date.now() - streamStartedAt,
      });
    } catch (streamError) {
      console.error("agent:stream:error", {
        runId,
        threadId,
        agentId: agent.id,
        error: toLogError(streamError),
      });

      const fallbackText =
        "I hit a temporary delivery issue while sending the response. Please retry your last message.";
      try {
        await thread.post(
          (async function* () {
            yield {
              type: "text-delta",
              textDelta: fallbackText,
            };
          })(),
        );
      } catch (fallbackError) {
        console.error("agent:stream:fallback-post:error", {
          runId,
          threadId,
          agentId: agent.id,
          error: toLogError(fallbackError),
        });
      }

      const fallbackHistory: CoreMessage[] = [
        ...messages,
        { role: "assistant" as const, content: fallbackText },
      ].slice(-MAX_THREAD_HISTORY);

      await persistThreadHistory(threadId, agent.id, fallbackHistory, runId);
      return;
    }

    // Save updated history with a bounded rolling window.
    const responseMessages = await result.response;

    const parsedResponseHistory = MessageHistorySchema.safeParse(
      responseMessages.messages,
    );
    if (!parsedResponseHistory.success) {
      console.warn("agent:history:invalid-response", {
        runId,
        threadId,
      });
    }

    const updatedHistory = [
      ...messages,
      ...(parsedResponseHistory.success ? parsedResponseHistory.data : []),
    ].slice(-MAX_THREAD_HISTORY);

    await persistThreadHistory(threadId, agent.id, updatedHistory, runId);

    console.info("agent:run:complete", { runId, agentId: agent.id, threadId });
  } catch (err) {
    console.error("agent:unhandled", { runId, error: toLogError(err) });
    await thread.post(
      (async function* () {
        yield {
          type: "text-delta",
          textDelta:
            "Something went wrong on my end. Please try again or contact your admin.",
        };
      })(),
    );
  }
}
