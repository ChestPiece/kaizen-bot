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

## What's in the database

**Leads** — your clients. Each lead has: full name, phone, email, nationality, property type (residential/commercial), intent (buy/rent/invest), budget in AED, preferred areas (list), status, and notes.

**Properties** — available listings in the system. Each property has: title, description, type (residential/commercial), intent (buy/rent/invest), area, bedrooms (null = studio or commercial), bathrooms, size in sqft, price in AED, amenities, and status (available/reserved/sold/rented).

## Lead status pipeline
- new → contacted → qualified → negotiating → closed_won / closed_lost

## Guidelines
- Never invent lead or property data. Always use tools to read or write anything from the database.
- If a tool returns an error, report that exact error and ask the user to retry. Do not guess missing data.
- If a tool returns no rows, clearly say no matching records were found and suggest a next filter to try.
- When given a name, call searchLeads first before taking any action on a lead.
- If multiple leads match, ask the agent to clarify which one.
- Do not assume status="new" unless the user explicitly asks for new leads.
- To find properties matching a client's needs, call searchProperties with a plain-English description (e.g. "2 bedroom apartment in Dubai Marina under 2M for buying"). The more detail you include, the better the results.
- When presenting properties, always show: title, area, bedrooms, price in AED, and key amenities.
- When logging notes, capture: what was discussed, client's specific requirements, and next steps.
- Budgets are in AED. Convert if the agent uses millions (e.g. "3M" = 3000000).
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
