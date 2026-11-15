import { CONSENT_REQUIRED, type Backend, type Channel, type Chat, type ChatPage, type ConversationRef, type MentionTarget, type Message, type NewChannel, type OutgoingMention, type Person, type Reaction, type SearchPage, type SearchResult, type Team } from '../shared/api'
import { BASE_SCOPES, CHANNEL_CREATE_SCOPES, CHANNEL_READ_SCOPES, PEOPLE_SCOPES } from './auth'

const GRAPH = 'https://graph.microsoft.com/v1.0'

type GetToken = (scopes?: string[]) => Promise<string>

interface Page<T> {
  value: T[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

interface GraphIdentity {
  id: string
  displayName?: string | null
}

interface GraphMessage {
  id: string
  messageType: string
  createdDateTime: string
  lastEditedDateTime?: string | null
  lastModifiedDateTime?: string | null
  deletedDateTime?: string | null
  replyToId?: string | null
  mentions?: {
    mentioned?: {
      user?: GraphIdentity | null
      conversation?: { id: string; conversationIdentityType?: string } | null
    } | null
  }[]
  subject?: string | null
  from?: { user?: GraphIdentity | null; application?: GraphIdentity | null } | null
  body: { contentType: 'html' | 'text'; content: string }
  reactions?: { reactionType: string; user?: { user?: GraphIdentity | null } }[]
  replies?: GraphMessage[]
}

/** A hit from the Microsoft Search API for entity type chatMessage. */
interface GraphSearchHit {
  hitId: string
  summary?: string
  resource: {
    id?: string
    createdDateTime?: string
    chatId?: string | null
    channelIdentity?: { teamId?: string | null; channelId?: string | null } | null
    webLink?: string | null
    from?: { emailAddress?: { name?: string | null; address?: string | null } | null } | null
  }
}

interface GraphSearchResponse {
  value: { hitsContainers: { hits?: GraphSearchHit[]; moreResultsAvailable?: boolean }[] }[]
}

const SEARCH_PAGE_SIZE = 25

/** Chats per batch (Graph's maximum for /me/chats); older ones load on request. */
const CHAT_PAGE_SIZE = 50

interface GraphChat {
  id: string
  topic?: string | null
  chatType: string
  createdDateTime?: string
  lastUpdatedDateTime?: string
  /** Note: lastUpdatedDateTime only tracks renames/membership; message activity comes from the preview. */
  lastMessagePreview?: { createdDateTime?: string } | null
  viewpoint?: { lastMessageReadDateTime?: string | null } | null
  members?: { userId?: string; displayName?: string | null }[]
}

const REACTION_EMOJI: Record<string, string> = {
  like: '👍',
  heart: '❤️',
  laugh: '😆',
  surprised: '😮',
  sad: '😢',
  angry: '😡'
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export class GraphBackend implements Backend {
  private constructor(
    private getToken: GetToken,
    readonly me: Person,
    private tenantId?: string
  ) {}

  static async connect(getToken: GetToken, tenantId?: string): Promise<GraphBackend> {
    const backend = new GraphBackend(getToken, { id: '', name: '' })
    const me = await backend.call<GraphIdentity>('/me?$select=id,displayName')
    return new GraphBackend(getToken, { id: me.id, name: me.displayName ?? 'Me' }, tenantId)
  }

  async markChatRead(chatId: string): Promise<void> {
    if (!this.tenantId) throw new Error('Unknown tenant; cannot mark chat read')
    await this.call(`/chats/${chatId}/markChatReadForUser`, {
      method: 'POST',
      body: { user: { id: this.me.id, tenantId: this.tenantId } }
    })
  }

  async listTeams(): Promise<Team[]> {
    const teams = await this.listAll<GraphIdentity & { description?: string }>('/me/joinedTeams')
    return teams
      .map((t) => ({ id: t.id, name: t.displayName ?? 'Team', description: t.description ?? undefined }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async listChannels(teamId: string): Promise<Channel[]> {
    const channels = await this.listAll<GraphIdentity & { description?: string }>(`/teams/${teamId}/channels`)
    return channels
      .map((c) => ({
        kind: 'channel' as const,
        id: c.id,
        teamId,
        name: c.displayName ?? 'channel',
        description: c.description ?? undefined
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async listChats(cursor?: string): Promise<ChatPage> {
    // The cursor is a Graph nextLink handed to the renderer; only ever follow it back to Graph,
    // since call() attaches the access token.
    if (cursor !== undefined && !cursor.startsWith(GRAPH + '/')) throw new Error('Invalid chat cursor')
    const page = await this.call<Page<GraphChat>>(cursor ?? `/me/chats?$expand=members,lastMessagePreview&$orderby=lastMessagePreview/createdDateTime desc&$top=${CHAT_PAGE_SIZE}`)
    const chats = page.value
      .map((c) => {
        const members = (c.members ?? [])
          .filter((m) => m.userId)
          .map((m) => ({ id: m.userId!, name: m.displayName ?? 'Unknown' }))
        const others = members.filter((m) => m.id !== this.me.id)
        return {
          kind: 'chat' as const,
          id: c.id,
          name: c.topic || others.map((m) => m.name).join(', ') || 'Chat',
          chatType: c.chatType,
          members,
          lastActivity: c.lastMessagePreview?.createdDateTime ?? c.lastUpdatedDateTime,
          lastReadAt: c.viewpoint?.lastMessageReadDateTime ?? undefined
        }
      })
      .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
    return { chats, olderCursor: page['@odata.nextLink'] }
  }

  async searchPeople(query: string): Promise<Person[]> {
    const q = query.replace(/["\\]/g, '').trim()
    if (!q) return []
    // $search does word-prefix matching ("ali" finds "Alice Smith" and "Bob Alito") but needs this header.
    const search = encodeURIComponent(`"displayName:${q}" OR "mail:${q}"`)
    const page = await this.call<Page<GraphIdentity & { mail?: string | null; userPrincipalName?: string | null }>>(
      `/users?$search=${search}&$select=id,displayName,mail,userPrincipalName&$top=15`,
      { scopes: PEOPLE_SCOPES, headers: { ConsistencyLevel: 'eventual' } }
    )
    return page.value
      .filter((u) => u.id !== this.me.id)
      .map((u) => ({ id: u.id, name: u.displayName ?? 'Unknown', email: u.mail ?? u.userPrincipalName ?? undefined }))
  }

  async createChat(people: Person[]): Promise<Chat> {
    const others = people.filter((p) => p.id !== this.me.id)
    if (others.length === 0) throw new Error('Pick at least one person')
    const chatType = others.length === 1 ? 'oneOnOne' : 'group'
    const member = (id: string) => ({
      '@odata.type': '#microsoft.graph.aadUserConversationMember',
      roles: ['owner'],
      'user@odata.bind': `${GRAPH}/users('${encodeURIComponent(id)}')`
    })
    // For 1:1 chats Graph returns the existing chat if there is one; group chats are always new.
    const created = await this.call<GraphChat>('/chats', {
      method: 'POST',
      body: { chatType, members: [this.me, ...others].map((p) => member(p.id)) }
    })
    const now = new Date().toISOString()
    return {
      kind: 'chat',
      id: created.id,
      name: created.topic || others.map((p) => p.name).join(', '),
      chatType: created.chatType ?? chatType,
      members: [this.me, ...others],
      // Sorts the new chat to the top and starts it out read.
      lastActivity: now,
      lastReadAt: now
    }
  }

  async searchMessages(query: string, offset = 0): Promise<SearchPage> {
    const request = {
      requests: [{ entityTypes: ['chatMessage'], query: { queryString: query }, from: offset, size: SEARCH_PAGE_SIZE }]
    }
    // Searching channel messages needs ChannelMessage.Read.All; without it, fall back to chats only.
    let response: GraphSearchResponse
    try {
      response = await this.call<GraphSearchResponse>('/search/query', { method: 'POST', body: request, scopes: CHANNEL_READ_SCOPES })
    } catch (err) {
      if (!String(err).includes(CONSENT_REQUIRED)) throw err
      response = await this.call<GraphSearchResponse>('/search/query', { method: 'POST', body: request, scopes: BASE_SCOPES })
    }
    const container = response.value[0]?.hitsContainers[0]
    const results = (container?.hits ?? []).flatMap((hit) => {
      const result = toSearchResult(hit)
      return result ? [result] : []
    })
    return { results, nextOffset: container?.moreResultsAvailable ? offset + SEARCH_PAGE_SIZE : undefined }
  }

  async createChannel(teamId: string, channel: NewChannel): Promise<Channel> {
    const created = await this.call<GraphIdentity & { description?: string | null }>(`/teams/${encodeURIComponent(teamId)}/channels`, {
      method: 'POST',
      scopes: CHANNEL_CREATE_SCOPES,
      body: {
        displayName: channel.name,
        description: channel.description || undefined,
        membershipType: channel.private ? 'private' : 'standard',
        // A private channel needs at least one owner.
        ...(channel.private && {
          members: [
            {
              '@odata.type': '#microsoft.graph.aadUserConversationMember',
              'user@odata.bind': `${GRAPH}/users('${encodeURIComponent(this.me.id)}')`,
              roles: ['owner']
            }
          ]
        })
      }
    })
    return {
      kind: 'channel',
      id: created.id,
      teamId,
      name: created.displayName ?? channel.name,
      description: created.description ?? channel.description
    }
  }

  async listMessages(ref: ConversationRef): Promise<Message[]> {
    const messages =
      ref.kind === 'channel'
        ? await this.call<Page<GraphMessage>>(`${channelPath(ref)}/messages?$top=50&$expand=replies`, {
            scopes: CHANNEL_READ_SCOPES
          })
        : await this.call<Page<GraphMessage>>(`/chats/${ref.id}/messages?$top=50`)
    return this.toMessages(messages.value)
  }

  async listReplies(ref: ConversationRef, messageId: string): Promise<Message[]> {
    if (ref.kind !== 'channel') return []
    const replies = await this.call<Page<GraphMessage>>(`${channelPath(ref)}/messages/${messageId}/replies?$top=50`, {
      scopes: CHANNEL_READ_SCOPES
    })
    return this.toMessages(replies.value)
  }

  async sendMessage(ref: ConversationRef, html: string, replyToId?: string, mentions: OutgoingMention[] = []): Promise<Message> {
    const base = ref.kind === 'channel' ? `${channelPath(ref)}/messages` : `/chats/${ref.id}/messages`
    const path = replyToId ? `${base}/${replyToId}/replies` : base
    const sent = await this.call<GraphMessage>(path, {
      method: 'POST',
      body: {
        body: { contentType: 'html', content: html },
        ...(mentions.length && { mentions: mentions.map(toGraphMention) })
      }
    })
    return this.toMessage(sent)
  }

  async listMessagesSince(ref: ConversationRef, since: string): Promise<Message[]> {
    const found: GraphMessage[] = []
    if (ref.kind === 'chat') {
      // Chat messages are flat (no threads) and support filtering/ordering on lastModifiedDateTime.
      const query = `$top=50&$orderby=lastModifiedDateTime desc&$filter=lastModifiedDateTime gt ${since}`
      for (let next: string | undefined = `/chats/${ref.id}/messages?${query}`; next; ) {
        const page: Page<GraphMessage> = await this.call<Page<GraphMessage>>(next)
        found.push(...page.value)
        next = page['@odata.nextLink']
      }
    } else {
      return (await this.listChannelChanges(ref, since)).messages
    }
    return found.filter((m) => m.messageType === 'message').map((m) => this.toMessage(m))
  }

  async listChannelChanges(ref: ConversationRef, since: string, cursor?: string): Promise<{ messages: Message[]; cursor?: string }> {
    // Only ever follow delta links back to Graph: call() attaches the access token.
    if (cursor !== undefined && !cursor.startsWith(GRAPH + '/')) throw new Error('Invalid delta link')
    const opts = { scopes: CHANNEL_READ_SCOPES }
    const roots: GraphMessage[] = []
    let next: string | undefined = cursor ?? `${channelPath(ref)}/messages/delta?$filter=lastModifiedDateTime gt ${since}`
    let deltaLink: string | undefined
    while (next) {
      const page: Page<GraphMessage> = await this.call<Page<GraphMessage>>(next, opts)
      roots.push(...page.value)
      next = page['@odata.nextLink']
      deltaLink = page['@odata.deltaLink'] ?? deltaLink
    }
    // Delta returns changed root posts; replies are fetched per changed thread.
    // TODO(verify on a real tenant): whether a new reply bumps its root's lastModifiedDateTime. If not,
    // replies in older threads will be missed and we need another strategy.
    const found: GraphMessage[] = [...roots]
    for (const root of roots) {
      for (let r: string | undefined = `${channelPath(ref)}/messages/${root.id}/replies?$top=50`; r; ) {
        const page: Page<GraphMessage> = await this.call<Page<GraphMessage>>(r, opts)
        found.push(...page.value.filter((m) => (m.lastModifiedDateTime ?? m.createdDateTime) > since))
        r = page['@odata.nextLink']
      }
    }
    return { messages: found.filter((m) => m.messageType === 'message').map((m) => this.toMessage(m)), cursor: deltaLink }
  }

  private toMessages(messages: GraphMessage[]): Message[] {
    return messages
      .filter((m) => m.messageType === 'message')
      .map((m) => this.toMessage(m))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  private toMessage(m: GraphMessage): Message {
    const from = m.from?.user ?? m.from?.application
    const body = m.body.contentType === 'html' ? m.body.content : escapeHtml(m.body.content)
    return {
      id: m.id,
      replyToId: m.replyToId ?? undefined,
      mentions: toMentionTargets(m),
      author: from ? { id: from.id, name: from.displayName ?? 'Unknown' } : null,
      createdAt: m.createdDateTime,
      html: m.subject ? `<p><strong>${escapeHtml(m.subject)}</strong></p>${body}` : body,
      replyCount: m.replies?.filter((r) => r.messageType === 'message' && !r.deletedDateTime).length ?? 0,
      reactions: this.toReactions(m.reactions ?? []),
      edited: Boolean(m.lastEditedDateTime),
      deleted: Boolean(m.deletedDateTime)
    }
  }

  private toReactions(reactions: NonNullable<GraphMessage['reactions']>): Reaction[] {
    const byEmoji = new Map<string, Reaction>()
    for (const r of reactions) {
      const emoji = REACTION_EMOJI[r.reactionType] ?? r.reactionType
      const entry = byEmoji.get(emoji) ?? { emoji, count: 0, mine: false }
      entry.count++
      if (r.user?.user?.id === this.me.id) entry.mine = true
      byEmoji.set(emoji, entry)
    }
    return [...byEmoji.values()]
  }

  private async listAll<T>(path: string): Promise<T[]> {
    const items: T[] = []
    for (let next: string | undefined = path; next; ) {
      const page: Page<T> = await this.call<Page<T>>(next)
      items.push(...page.value)
      next = page['@odata.nextLink']
    }
    return items
  }

  private async call<T>(
    path: string,
    opts: { method?: string; body?: unknown; scopes?: string[]; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const token = await this.getToken(opts.scopes)
    const url = path.startsWith('http') ? path : GRAPH + path
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { ...opts.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      })
      if (res.status === 429 && attempt < 2) {
        await sleep(Number(res.headers.get('Retry-After') ?? 2) * 1000)
        continue
      }
      if (!res.ok) throw new Error(`Microsoft Graph returned ${res.status}: ${await errorDetail(res)}`)
      if (res.status === 204) return undefined as T
      return (await res.json()) as T
    }
  }
}

function toMentionTargets(m: GraphMessage): MentionTarget[] {
  const targets: MentionTarget[] = []
  for (const { mentioned } of m.mentions ?? []) {
    if (mentioned?.user?.id) targets.push({ type: 'user', id: mentioned.user.id })
    const conversation = mentioned?.conversation
    if (conversation?.conversationIdentityType === 'channel') targets.push({ type: 'channel', id: conversation.id })
    if (conversation?.conversationIdentityType === 'team') targets.push({ type: 'team', id: conversation.id })
  }
  return targets
}

function toSearchResult(hit: GraphSearchHit): SearchResult | null {
  const r = hit.resource
  const id = r.id ?? hit.hitId
  const channel = r.channelIdentity
  let conversation: ConversationRef
  if (channel?.teamId && channel.channelId) conversation = { kind: 'channel', id: channel.channelId, teamId: channel.teamId }
  else if (r.chatId) conversation = { kind: 'chat', id: r.chatId }
  else return null
  // Search hits don't say which thread a channel reply belongs to, but the Teams link does.
  let replyToId: string | undefined
  if (conversation.kind === 'channel' && r.webLink) {
    try {
      const parent = new URL(r.webLink).searchParams.get('parentMessageId')
      if (parent && parent !== id) replyToId = parent
    } catch {
      // No usable link: the result still opens the channel.
    }
  }
  const sender = r.from?.emailAddress
  return {
    id,
    conversation,
    replyToId,
    author: sender?.name ? { id: sender.address ?? sender.name, name: sender.name, email: sender.address ?? undefined } : null,
    createdAt: r.createdDateTime ?? '',
    snippet: snippetParts(hit.summary ?? '')
  }
}

/** Search summaries are HTML-ish, with matches in <c0>…</c0> and elisions as <ddd/>; returns plain text parts. */
export function snippetParts(summary: string): string[] {
  const text = (s: string) =>
    s
      .replace(/<ddd\/>/g, '…')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
  return summary.split(/<c0>([\s\S]*?)<\/c0>/).map(text)
}

/** Graph's chatMessageMention: a person, or a whole channel or team (Teams shows those by channel/team name). */
function toGraphMention({ id, target }: OutgoingMention): unknown {
  return {
    id,
    mentionText: target.name,
    mentioned:
      target.type === 'user'
        ? { user: { id: target.id, displayName: target.name, userIdentityType: 'aadUser' } }
        : { conversation: { id: target.id, displayName: target.name, conversationIdentityType: target.type } }
  }
}

function channelPath(ref: ConversationRef): string {
  return `/teams/${ref.teamId}/channels/${ref.id}`
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text()
  try {
    return JSON.parse(text).error?.message ?? text
  } catch {
    return text || res.statusText
  }
}
