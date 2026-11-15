import type { Backend, Channel, Chat, ChatPage, ConversationRef, MentionTarget, Message, NewChannel, OutgoingMention, Person, SearchPage, SearchResult, Team } from '../shared/api'

// In-memory demo workspace so the UI can be explored without a Microsoft 365 tenant.

const me: Person = { id: 'u-me', name: 'Jordan Lee' }
const priya: Person = { id: 'u-priya', name: 'Priya Natarajan' }
const marcus: Person = { id: 'u-marcus', name: 'Marcus Webb' }
const sofia: Person = { id: 'u-sofia', name: 'Sofia Alvarez' }
const dev: Person = { id: 'u-dev', name: 'Dev Okafor' }

type Thread = Message & { replies: Message[] }

const people = [me, priya, marcus, sofia, dev]

/** Colleagues you haven't chatted with yet: only reachable through the directory search. */
const directory: Person[] = [
  ...people.filter((p) => p !== me),
  { id: 'u-aisha', name: 'Aisha Khan' },
  { id: 'u-tom', name: 'Tom Becker' },
  { id: 'u-mei', name: 'Mei Tanaka' },
  { id: 'u-sam', name: 'Sam Alvarez' }
].map((p) => ({ ...p, email: `${p.name.split(' ')[0].toLowerCase()}@acme.example` }))

/** Demo messages mark mentions as <span class="mention">@Name</span>; "@channel" mentions the whole channel. */
function mentionsIn(html: string): MentionTarget[] {
  return [...html.matchAll(/<span class="mention">@([^<]+)<\/span>/g)].flatMap(([, name]): MentionTarget[] => {
    if (name === 'channel') return [{ type: 'channel', id: '' }]
    const person = people.find((p) => p.name === name)
    return person ? [{ type: 'user', id: person.id }] : []
  })
}

let seq = 0
const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString()

function message(author: Person, minAgo: number, html: string, replies: [Person, number, string][] = []): Thread {
  return {
    id: `m-${++seq}`,
    author,
    createdAt: minutesAgo(minAgo),
    html,
    mentions: mentionsIn(html),
    replyCount: replies.length,
    reactions: [],
    edited: false,
    deleted: false,
    replies: replies.map(([a, m, h]) => message(a, m, h))
  }
}

const at = (person: Person | 'channel'): string =>
  `<span class="mention">@${person === 'channel' ? 'channel' : person.name}</span>`

const teams: Team[] = [
  { id: 't-acme', name: 'Acme Corp' },
  { id: 't-design', name: 'Design Guild' }
]

const channels: Channel[] = [
  { kind: 'channel', id: 'c-general', teamId: 't-acme', name: 'General', description: 'Company-wide announcements' },
  { kind: 'channel', id: 'c-eng', teamId: 't-acme', name: 'engineering', description: 'Builds, deploys and code talk' },
  { kind: 'channel', id: 'c-launch', teamId: 't-acme', name: 'launch-q4', description: 'Q4 launch coordination' },
  { kind: 'channel', id: 'c-random', teamId: 't-acme', name: 'random', description: 'Non-work banter' },
  { kind: 'channel', id: 'c-dgeneral', teamId: 't-design', name: 'General' },
  { kind: 'channel', id: 'c-crit', teamId: 't-design', name: 'design-crit', description: 'Share work, get feedback' }
]

const chats: Chat[] = [
  { kind: 'chat', id: 'd-priya', name: priya.name, chatType: 'oneOnOne', members: [me, priya], lastActivity: minutesAgo(4), lastReadAt: minutesAgo(18) },
  { kind: 'chat', id: 'd-marcus', name: marcus.name, chatType: 'oneOnOne', members: [me, marcus], lastActivity: minutesAgo(95) },
  {
    kind: 'chat',
    id: 'd-group',
    name: `${sofia.name}, ${dev.name}`,
    chatType: 'group',
    members: [me, sofia, dev],
    lastActivity: minutesAgo(60 * 26)
  },
  {
    kind: 'chat',
    id: 'mt-standup',
    name: 'Daily standup',
    chatType: 'meeting',
    members: [me, priya, marcus, dev],
    lastActivity: minutesAgo(30),
    lastReadAt: minutesAgo(60)
  },
  {
    kind: 'chat',
    id: 'mt-q4review',
    name: 'Q4 launch review',
    chatType: 'meeting',
    members: [me, sofia, marcus, priya, dev],
    lastActivity: minutesAgo(60 * 22)
  },
  // Older chats, only reachable via "Load older chats" (demo pages are small so that's visible).
  { kind: 'chat', id: 'd-sofia', name: sofia.name, chatType: 'oneOnOne', members: [me, sofia], lastActivity: minutesAgo(60 * 24 * 9) },
  {
    kind: 'chat',
    id: 'mt-kickoff',
    name: 'Design system kickoff',
    chatType: 'meeting',
    members: [me, sofia, dev],
    lastActivity: minutesAgo(60 * 24 * 12)
  },
  { kind: 'chat', id: 'd-dev', name: dev.name, chatType: 'oneOnOne', members: [me, dev], lastActivity: minutesAgo(60 * 24 * 20) }
]

const CHAT_PAGE_SIZE = 5

const messages: Record<string, Thread[]> = {
  'c-general': [
    message(sofia, 60 * 24 * 3, `<p>${at('channel')} Benefits enrollment closes Friday, please don't miss it.</p>`),
    message(sofia, 60 * 28, '<p>Reminder: office is closed Monday for the holiday 🎉</p>'),
    message(marcus, 60 * 3, '<p>Welcome <span class="mention">@Dev Okafor</span> to the team! 👋</p>', [
      [dev, 170, '<p>Thanks everyone, excited to be here!</p>'],
      [priya, 160, '<p>Welcome aboard!</p>']
    ]),
    message(priya, 42, '<p>All-hands slides are up in the Files tab.</p>')
  ],
  'c-eng': [
    message(dev, 60 * 5, '<p>Is anyone else seeing flaky tests in <code>checkout.spec.ts</code>?</p>', [
      [marcus, 290, '<p>Yeah, it\'s the timezone fixture. I have a fix in review.</p>'],
      [dev, 285, '<p>Legend, thanks</p>'],
      [marcus, 280, `<p>${at(me)} want to pair on the fixture after lunch?</p>`]
    ]),
    message(marcus, 60 * 4, '<p>Deploying <strong>v2.14.0</strong> to staging now.</p>'),
    message(marcus, 60 * 4 - 2, '<p>Staging looks healthy ✅</p>'),
    message(priya, 25, `<p>${at(me)} can you review the migration PR before 3pm?</p><pre><code>ALTER TABLE orders ADD COLUMN region text;</code></pre>`),
    message(me, 12, '<p>On it 👀</p>')
  ],
  'c-launch': [
    message(marcus, 60 * 24 * 10, `<p>${at(me)} can you double-check the pricing page copy before launch?</p>`),
    message(sofia, 60 * 30, '<p>Launch checklist v3 is ready. Please claim your items by Friday.</p>', [
      [me, 60 * 29, '<p>I\'ll take the release notes.</p>']
    ])
  ],
  'c-random': [
    message(priya, 60 * 24 * 20, `<p>${at(me)} thanks for the coffee recommendation ☕</p>`),
    message(dev, 90, '<p>Who left the excellent banana bread in the kitchen? 🍌</p>')
  ],
  'c-dgeneral': [message(sofia, 60 * 6, '<p>New icon set landed in the library.</p>')],
  'c-crit': [message(sofia, 60 * 2, '<p>Looking for feedback on the onboarding flow mocks this afternoon.</p>')],
  'd-priya': [
    message(priya, 20, '<p>Hey, do you have a minute to look at the migration?</p>'),
    message(me, 15, '<p>Sure, send it over</p>'),
    message(priya, 4, '<p>Thanks! Link is in #engineering</p>')
  ],
  'd-marcus': [message(marcus, 95, '<p>Lunch on Thursday?</p>')],
  'mt-standup': [message(marcus, 30, '<p>Notes from today: staging deploy done, migration PR needs review.</p>')],
  'mt-q4review': [message(sofia, 60 * 22, '<p>Recording and slides are in the meeting recap.</p>')],
  'd-sofia': [message(sofia, 60 * 24 * 9, '<p>Thanks for the help with the icon export script!</p>')],
  'mt-kickoff': [message(dev, 60 * 24 * 12, '<p>Kickoff deck: tokens first, components second.</p>')],
  'd-dev': [message(dev, 60 * 24 * 20, '<p>First day tomorrow, see you then 👋</p>')],
  'd-group': [
    message(dev, 60 * 24 * 4, `<p>${at(me)} do you have the Figma link from Tuesday?</p>`),
    message(sofia, 60 * 26, '<p>Can we move our sync to 2pm tomorrow?</p>')
  ]
}

const strip = ({ replies: _replies, ...m }: Thread): Message => m

export class MockBackend implements Backend {
  readonly me = me

  async listTeams(): Promise<Team[]> {
    return teams
  }

  async listChannels(teamId: string): Promise<Channel[]> {
    return channels.filter((c) => c.teamId === teamId)
  }

  async listChats(cursor?: string): Promise<ChatPage> {
    for (const c of chats) c.lastReadAt ??= c.lastActivity
    const sorted = [...chats].sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
    const start = cursor ? Number(cursor) : 0
    const end = start + CHAT_PAGE_SIZE
    return { chats: sorted.slice(start, end), olderCursor: end < sorted.length ? String(end) : undefined }
  }

  async listMessages(ref: ConversationRef): Promise<Message[]> {
    return (messages[ref.id] ?? []).map(strip)
  }

  async listReplies(ref: ConversationRef, messageId: string): Promise<Message[]> {
    return messages[ref.id]?.find((m) => m.id === messageId)?.replies ?? []
  }

  async listMessagesSince(ref: ConversationRef, since: string): Promise<Message[]> {
    return (messages[ref.id] ?? [])
      .flatMap((root) => [strip(root), ...root.replies.map((r) => ({ ...r, replyToId: root.id }))])
      .filter((m) => m.createdAt > since)
  }

  async listChannelChanges(ref: ConversationRef, since: string, cursor?: string): Promise<{ messages: Message[]; cursor?: string }> {
    const now = new Date().toISOString()
    return { messages: await this.listMessagesSince(ref, cursor ?? since), cursor: now }
  }

  async markChatRead(chatId: string): Promise<void> {
    const chat = chats.find((c) => c.id === chatId)
    if (chat) chat.lastReadAt = new Date().toISOString()
  }

  /** Make a couple of channels start out unread so the demo has something to show. */
  initialChannelReadAt(channel: Channel): string | undefined {
    return { 'c-eng': minutesAgo(60 * 6), 'c-launch': minutesAgo(60 * 24 * 11), 'c-crit': minutesAgo(60 * 3) }[channel.id]
  }

  async searchPeople(query: string): Promise<Person[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return directory.filter((p) => {
      const haystack = [...p.name.toLowerCase().split(' '), p.email ?? '']
      return words.every((w) => haystack.some((h) => h.startsWith(w)))
    })
  }

  async searchMessages(query: string, offset = 0): Promise<SearchPage> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const found: SearchResult[] = []
    for (const [id, threads] of Object.entries(messages)) {
      const channel = channels.find((c) => c.id === id)
      const conversation: ConversationRef = channel ? { kind: 'channel', id, teamId: channel.teamId } : { kind: 'chat', id }
      for (const root of threads) {
        for (const m of [root, ...root.replies]) {
          const plain = m.html.replace(/<[^>]+>/g, ' ').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim()
          if (!words.every((w) => plain.toLowerCase().includes(w))) continue
          // Mark matches the way Graph's summaries do: odd parts are hits.
          const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
          found.push({
            id: m.id,
            conversation,
            replyToId: m === root ? undefined : root.id,
            author: m.author,
            createdAt: m.createdAt,
            snippet: plain.split(pattern)
          })
        }
      }
    }
    found.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const page = found.slice(offset, offset + 10)
    return { results: page, nextOffset: offset + 10 < found.length ? offset + 10 : undefined }
  }

  async createChannel(teamId: string, channel: NewChannel): Promise<Channel> {
    if (channels.some((c) => c.teamId === teamId && c.name.toLowerCase() === channel.name.toLowerCase())) {
      throw new Error('A channel with that name already exists in this team.')
    }
    const created: Channel = { kind: 'channel', id: `c-new-${++seq}`, teamId, name: channel.name, description: channel.description }
    channels.push(created)
    messages[created.id] = []
    return created
  }

  async createChat(picked: Person[]): Promise<Chat> {
    const others = picked.filter((p) => p.id !== me.id)
    if (others.length === 0) throw new Error('Pick at least one person')
    if (others.length === 1) {
      const existing = chats.find((c) => c.chatType === 'oneOnOne' && c.members.some((m) => m.id === others[0].id))
      if (existing) return existing
    }
    const now = new Date().toISOString()
    const chat: Chat = {
      kind: 'chat',
      id: `d-new-${++seq}`,
      name: others.map((p) => p.name).join(', '),
      chatType: others.length === 1 ? 'oneOnOne' : 'group',
      members: [me, ...others.map(({ id, name }) => ({ id, name }))],
      lastActivity: now,
      lastReadAt: now
    }
    chats.push(chat)
    messages[chat.id] = []
    return chat
  }

  async sendMessage(ref: ConversationRef, html: string, replyToId?: string, mentions: OutgoingMention[] = []): Promise<Message> {
    const sent = message(me, 0, html)
    sent.mentions = mentions.map(({ target }) => ({ type: target.type, id: target.id }))
    if (replyToId) {
      const root = messages[ref.id]?.find((m) => m.id === replyToId)
      if (!root) throw new Error('Thread not found')
      root.replies.push(sent)
      root.replyCount = root.replies.length
    } else {
      ;(messages[ref.id] ??= []).push(sent)
    }
    const chat = chats.find((c) => c.id === ref.id)
    if (chat) chat.lastActivity = chat.lastReadAt = sent.createdAt
    return strip(sent)
  }
}
