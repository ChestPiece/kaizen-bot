import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { supabase, getAgentBySlackId } from './supabase'
import { tools } from './tools'
import type { CoreMessage } from '@/types'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = (agentName: string, agentRole: string, today: string) => `
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
`.trim()

interface RunAgentParams {
  userMessage: string
  slackUserId: string
  threadId: string
  thread: {
    startTyping: () => Promise<void>
    post: (stream: AsyncIterable<unknown>) => Promise<void>
  }
}

export async function runAgent({ userMessage, slackUserId, threadId, thread }: RunAgentParams) {
  const agent = await getAgentBySlackId(slackUserId)
  if (!agent) {
    await thread.post(
      (async function* () {
        yield { type: 'text-delta', textDelta: "Sorry, I couldn't find your agent profile. Please ask your admin to add you to the system." }
      })()
    )
    return
  }

  // Load existing thread history
  const { data: threadState } = await supabase
    .from('thread_state')
    .select('message_history')
    .eq('thread_id', threadId)
    .single()

  const history: CoreMessage[] = (threadState?.message_history as CoreMessage[]) ?? []

  const messages: CoreMessage[] = [...history, { role: 'user', content: userMessage }]

  // Dubai timezone
  const today = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const result = await streamText({
    model: openai('gpt-4o'),
    system: SYSTEM_PROMPT(agent.full_name, agent.role, today),
    messages: messages as Parameters<typeof streamText>[0]['messages'],
    tools,
    maxSteps: 5,
    experimental_context: { agentId: agent.id },
  })

  await thread.startTyping()
  await thread.post(result.fullStream)

  // Save updated history (cap at 20 messages)
  const responseMessages = await result.response
  const updatedHistory = [
    ...messages,
    ...(responseMessages.messages as CoreMessage[]),
  ].slice(-20)

  await supabase.from('thread_state').upsert({
    thread_id: threadId,
    agent_id: agent.id,
    message_history: updatedHistory,
    updated_at: new Date().toISOString(),
  })
}
