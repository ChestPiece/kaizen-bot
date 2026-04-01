import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent } from "ai";
import type { ModelMessage } from "ai";
import type { Thread } from "chat";
import { z } from "zod";
import { supabase, getAgentBySlackId } from "./supabase";
import { tools } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import type { CoreMessage } from "@/types";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing required environment variable: OPENAI_API_KEY");
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";
const MAX_THREAD_HISTORY = 20;

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
  slackUserId: string;
  threadId: string;
  thread: Thread;
}

export async function runAgent({
  userMessage,
  slackUserId,
  threadId,
  thread,
}: RunAgentParams) {
  const runId = Math.random().toString(36).slice(2, 10);

  try {
    const agent = await getAgentBySlackId(slackUserId);
    if (!agent) {
      console.warn("agent:no-profile", { runId, slackUserId });
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

    // Load existing thread history with timeout guard
    const threadStateResult = await Promise.race([
      supabase
        .from("thread_state")
        .select("message_history")
        .eq("thread_id", threadId)
        .single(),
      new Promise<{ data: null }>((_, reject) =>
        setTimeout(
          () => reject(new Error("thread_state timeout")),
          3000,
        ),
      ),
    ]).catch((err) => {
      console.warn("agent:thread-state:timeout", {
        runId,
        threadId,
        error: String(err),
      });
      return { data: null };
    });

    const rawThreadState = threadStateResult.data;

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
    await thread.post(result.fullStream);

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

    await supabase.from("thread_state").upsert({
      thread_id: threadId,
      agent_id: agent.id,
      message_history: updatedHistory,
      updated_at: new Date().toISOString(),
    });

    console.info("agent:run:complete", { runId, agentId: agent.id, threadId });
  } catch (err) {
    console.error("agent:unhandled", { runId, error: String(err) });
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
