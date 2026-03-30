import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent } from "ai";
import type { ModelMessage } from "ai";
import type { Thread } from "chat";
import { z } from "zod";
import { supabase, getAgentBySlackId } from "./supabase";
import { tools } from "./tools";
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

const SYSTEM_PROMPT = (agentName: string, agentRole: string, today: string) =>
  `
You are Kaizen AI, an internal assistant for Kaizen Real Estate in Dubai.
You help real estate agents manage their leads and pipeline through natural conversation.

Today's date: ${today} (Dubai time, GST = UTC+4)

Agent you're speaking with: ${agentName} (${agentRole})

## CRM Status Definitions
- new: Just added, not yet contacted
- contacted: Initial contact made, interest unconfirmed
- qualified: Budget and intent confirmed, serious buyer/renter
- negotiating: Active deal discussion in progress
- closed_won: Deal completed successfully
- closed_lost: Lead dropped out or went elsewhere

## Guidelines
- Never invent lead data. Always use tools to read or write CRM information.
- When given a name, search for them first before taking actions.
- If multiple leads match a search, ask the agent to clarify which one.
- When logging notes, be concise but capture the key facts (budget, preferences, next steps).
- Budgets are in AED. Convert if the agent uses millions (e.g., "3M" = 3000000).
- Be direct and efficient — agents are busy.
`.trim();

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
  const agent = await getAgentBySlackId(slackUserId);
  if (!agent) {
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

  // Load existing thread history
  const { data: rawThreadState } = await supabase
    .from("thread_state")
    .select("message_history")
    .eq("thread_id", threadId)
    .single();

  const parsedThreadState = ThreadStateSchema.safeParse(rawThreadState);
  if (!parsedThreadState.success && rawThreadState) {
    console.warn("agent:history:invalid", {
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

  // Dubai timezone
  const today = new Date().toLocaleDateString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const agentModel = new ToolLoopAgent({
    model: openai(OPENAI_MODEL),
    instructions: SYSTEM_PROMPT(agent.full_name, agent.role, today),
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
    console.warn(
      "Invalid response message shape. Persisting only validated prior history for thread:",
      threadId,
    );
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
}
