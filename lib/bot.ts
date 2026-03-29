import { Chat } from 'chat'
import { createSlackAdapter } from '@chat-adapter/slack'
import { createMemoryState } from '@chat-adapter/state-memory'
import { runAgent } from './agent'

export const bot = new Chat({
  userName: 'kaizen',
  adapters: {
    slack: createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN!,
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
    }),
  },
  state: createMemoryState(),
})

bot.onNewMention(async (thread, message) => {
  await thread.subscribe()
  await runAgent({
    userMessage: message.text,
    slackUserId: message.author.id,
    threadId: thread.id,
    thread,
  })
})

bot.onSubscribedMessage(async (thread, message) => {
  await runAgent({
    userMessage: message.text,
    slackUserId: message.author.id,
    threadId: thread.id,
    thread,
  })
})
