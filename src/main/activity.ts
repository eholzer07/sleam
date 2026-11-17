import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CHANNEL_GONE, type Backend, type Channel, type ChannelActivity, type Chat, type ConversationRef, type Mention, type MentionsState, type Message, type Team } from '../shared/api'

// Background activity scanner: finds @-mentions and tracks channel read state (Graph has none), keeping both in a
// local file so they survive restarts and catch up on whatever happened while the computer was off.
//
// Each conversation has a "scanned through" watermark; a check asks only for messages changed after it, and
// duplicates are ignored. Channels additionally keep Graph's delta link, so a check of a quiet channel is an
// empty response.
//
// Checks are tiered to stay well inside Graph's per-app request limits:
//   - the open channel: every ~5 s for free, via the messages the conversation view already loads (observe())
//   - active channels (any message in the last 15 min) and chats: every 15 s
//   - other channels in the team being viewed: every 60 s
//   - everything else: every 5 min
// Throttling (HTTP 429) stretches all intervals, which then recover gradually.

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
const TICK = 15 * SECOND
const CHAT_EVERY = 15 * SECOND
const ACTIVE_CHANNEL_EVERY = 15 * SECOND
const TEAM_CHANNEL_EVERY = MINUTE
const IDLE_CHANNEL_EVERY = 5 * MINUTE
const CHANNEL_LIST_EVERY = 5 * MINUTE
/** How soon a deleted channel may trigger another channel-list refresh. */
const GONE_RECHECK_GAP = 30 * SECOND
/** A channel with a message this recent counts as active. */
const ACTIVE_WINDOW = 15 * MINUTE
const MAX_BACKOFF = 8
/** After throttling stops, intervals halve back toward normal this often. */
const BACKOFF_RECOVERY = 2 * MINUTE
const OVERLAP = 5 * MINUTE
const FIRST_RUN_LOOKBACK = 14 * DAY
const RETENTION = 90 * DAY
/** Bounds how far back one scan pages through the chat list. */
const MAX_CHAT_PAGES = 20
/** A gap longer than this is reported to the UI as "catching up". */
const CATCH_UP_THRESHOLD = 15 * MINUTE

interface StoreFile {
  version: 1
  /**
   * chats: start of the last complete chat scan; chats first seen are scanned from here.
   * channels: start of the last channel-list refresh; channels discovered later are scanned from here.
   */
  floors: { chats: string; channels: string }
  watermarks: Record<string, string>
  mentions: Mention[]
  /** Keyed by channel id. Optional so older stores still load. */
  channels?: Record<string, ChannelActivity>
  /** Graph delta links per channel id. */
  deltaLinks?: Record<string, string>
}

export class ActivityScanner {
  private data: StoreFile
  private timer: NodeJS.Timeout | null = null
  private running = false
  private lastChatScan = 0
  private lastChannelList = 0
  private channelList: Channel[] = []
  /** When each channel was last checked (in-memory: after a restart everything is due). */
  private lastChecked = new Map<string, number>()
  /** Newest message from anyone, per channel, for the "active" tier. */
  private lastMessageAt = new Map<string, number>()
  private currentTeam: string | null = null
  private backoff = 1
  private lastBackoffChange = 0
  private catchingUp: MentionsState['catchingUp'] = null
  private lastScanAt?: string
  private error?: string

  constructor(
    private backend: Backend,
    private file: string
  ) {
    this.data = this.load()
    for (const [id, entry] of Object.entries(this.data.channels ?? {})) {
      if (entry.latestAt) this.lastMessageAt.set(id, Date.parse(entry.latestAt))
    }
  }

  start(): void {
    this.stop()
    void this.tick()
    this.timer = setInterval(() => void this.tick(), TICK)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Scan now, e.g. after the computer wakes from sleep. */
  wake(): void {
    void this.tick()
  }

  /**
   * A channel answered 410 Gone somewhere (the open channel, a send). Re-list channels on the next tick so it drops
   * out of unreads and stops being scanned, instead of waiting for the regular refresh.
   */
  recheckChannels(): void {
    if (Date.now() - this.lastChannelList < GONE_RECHECK_GAP) return
    this.lastChannelList = 0
    this.wake()
  }

  /** The team the user is looking at; its channels are checked more often. */
  setCurrentTeam(teamId: string | null): void {
    this.currentTeam = teamId
  }

  /**
   * Messages the UI loaded for an open channel or thread. Using them keeps the open channel current without
   * extra Graph requests. Watermarks don't move: these are only the latest page.
   */
  observe(ref: ConversationRef, messages: Message[]): void {
    if (ref.kind !== 'channel') return
    const entry = this.data.channels?.[ref.id]
    if (!entry) return
    this.noteActivity(entry.channel, messages)
    this.record(entry.channel, messages)
  }

  state(): MentionsState {
    const mentions = [...this.data.mentions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { mentions, catchingUp: this.catchingUp, lastScanAt: this.lastScanAt, error: this.error }
  }

  channelActivity(): ChannelActivity[] {
    return Object.values(this.data.channels ?? {})
  }

  markChannelRead(channelId: string): void {
    const entry = this.data.channels?.[channelId]
    if (!entry) return
    entry.lastReadAt = new Date().toISOString()
    // Viewing a channel also covers its mentions.
    for (const m of this.data.mentions) if (m.conversation.id === channelId) m.seen = true
    this.save()
  }

  markSeen(ids: string[]): void {
    const wanted = new Set(ids)
    let changed = false
    for (const m of this.data.mentions) {
      if (wanted.has(m.id) && !m.seen) {
        m.seen = true
        changed = true
      }
    }
    if (changed) this.save()
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    const errors: string[] = []
    try {
      if (Date.now() - this.lastChatScan >= CHAT_EVERY * this.backoff) {
        await this.scanChats(errors)
        this.lastChatScan = Date.now()
      }
      if (Date.now() - this.lastChannelList >= CHANNEL_LIST_EVERY * this.backoff) {
        await this.refreshChannelList()
        this.lastChannelList = Date.now()
      }
      await this.scanDueChannels(errors)
      this.prune()
      this.save()
      this.lastScanAt = new Date().toISOString()
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    } finally {
      // Back off when Graph throttles us; otherwise drift back toward normal speed.
      if (errors.some((e) => / 429\b/.test(e))) {
        this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF)
        this.lastBackoffChange = Date.now()
      } else if (this.backoff > 1 && Date.now() - this.lastBackoffChange >= BACKOFF_RECOVERY) {
        this.backoff = Math.max(1, this.backoff / 2)
        this.lastBackoffChange = Date.now()
      }
      this.error = errors[0]
      this.catchingUp = null
      this.running = false
    }
  }

  // ---- chats

  private async scanChats(errors: string[]): Promise<void> {
    const startedAt = new Date().toISOString()
    const floor = this.data.floors.chats
    const targets = await this.changedChats(floor)
    const sinceOf = (chat: Chat) => new Date(Date.parse(maxIso(this.data.watermarks[watermarkKey(chat)], floor)) - OVERLAP).toISOString()
    this.beginCatchUp(targets.map(sinceOf))

    let failed = false
    for (const chat of targets) {
      const scannedAt = new Date().toISOString()
      try {
        this.record(chat, await this.backend.listMessagesSince(chat, sinceOf(chat)))
        this.data.watermarks[watermarkKey(chat)] = scannedAt
      } catch (err) {
        failed = true
        errors.push(`Couldn't check ${chat.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
      this.stepCatchUp()
    }
    // Only raise the floor when every chat succeeded, so a failure gets retried from the same point.
    if (!failed) this.data.floors.chats = startedAt
  }

  /** Chats with a message newer than the floor, walking the (newest-first) chat list only as far as needed. */
  private async changedChats(floor: string): Promise<Chat[]> {
    const cutoff = new Date(Date.parse(floor) - OVERLAP).toISOString()
    const changed: Chat[] = []
    let cursor: string | undefined
    for (let page = 0; page < MAX_CHAT_PAGES; page++) {
      const { chats, olderCursor } = await this.backend.listChats(cursor)
      for (const chat of chats) {
        if (!chat.lastActivity || chat.lastActivity <= cutoff) continue
        const watermark = this.data.watermarks[watermarkKey(chat)]
        if (!watermark || chat.lastActivity > new Date(Date.parse(watermark) - OVERLAP).toISOString()) changed.push(chat)
      }
      const oldest = chats[chats.length - 1]?.lastActivity
      if (!olderCursor || (oldest && oldest <= cutoff)) break
      cursor = olderCursor
    }
    return changed
  }

  // ---- channels

  private async refreshChannelList(): Promise<void> {
    const startedAt = new Date().toISOString()
    const teams: Team[] = await this.backend.listTeams()
    const known = (this.data.channels ??= {})
    const firstList = Object.keys(known).length === 0
    const channels: Channel[] = []
    for (const team of teams) {
      for (const channel of await this.backend.listChannels(team.id)) {
        channels.push(channel)
        const entry = known[channel.id]
        if (entry) {
          Object.assign(entry, { channel, teamName: team.name })
          continue
        }
        // New channel. On the very first run everything starts out read; a channel joined later (perhaps while
        // the computer was off) is scanned from the previous listing, so its mentions aren't missed.
        known[channel.id] = { channel, teamName: team.name, lastReadAt: this.backend.initialChannelReadAt?.(channel) ?? startedAt }
        this.data.watermarks[watermarkKey(channel)] ??= this.data.floors.channels
        if (!firstList) known[channel.id].lastReadAt = this.data.floors.channels
      }
    }
    // Forget channels that were deleted or that the user left.
    const live = new Set(channels.map((c) => c.id))
    for (const id of Object.keys(known)) {
      if (live.has(id)) continue
      delete known[id]
      delete this.data.deltaLinks?.[id]
    }
    this.channelList = channels
    this.data.floors.channels = startedAt
  }

  private channelInterval(channel: Channel): number {
    const last = this.lastMessageAt.get(channel.id)
    const base =
      last !== undefined && Date.now() - last < ACTIVE_WINDOW
        ? ACTIVE_CHANNEL_EVERY
        : channel.teamId === this.currentTeam
          ? TEAM_CHANNEL_EVERY
          : IDLE_CHANNEL_EVERY
    return base * this.backoff
  }

  private async scanDueChannels(errors: string[]): Promise<void> {
    const now = Date.now()
    const due = this.channelList.filter((c) => now - (this.lastChecked.get(c.id) ?? 0) >= this.channelInterval(c))
    const sinceOf = (c: Channel) => this.data.watermarks[watermarkKey(c)] ?? this.data.floors.channels
    this.beginCatchUp(due.map(sinceOf))

    let sawDeleted = false
    for (const channel of due) {
      const key = watermarkKey(channel)
      const scannedAt = new Date().toISOString()
      const since = new Date(Date.parse(sinceOf(channel)) - OVERLAP).toISOString()
      const links = (this.data.deltaLinks ??= {})
      try {
        let result
        try {
          result = await this.backend.listChannelChanges(channel, since, links[channel.id])
        } catch (err) {
          // Delta links expire; start over from the watermark.
          if (!links[channel.id]) throw err
          delete links[channel.id]
          result = await this.backend.listChannelChanges(channel, since)
        }
        if (result.cursor) links[channel.id] = result.cursor
        this.noteActivity(channel, result.messages)
        this.record(channel, result.messages)
        this.data.watermarks[key] = scannedAt
      } catch (err) {
        // Deleted in Teams: not an error worth showing; the channel-list refresh below drops it.
        if (String(err).includes(CHANNEL_GONE)) sawDeleted = true
        else errors.push(`Couldn't check #${channel.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
      this.lastChecked.set(channel.id, Date.now())
      this.stepCatchUp()
    }
    if (sawDeleted && Date.now() - this.lastChannelList >= GONE_RECHECK_GAP) {
      await this.refreshChannelList()
      this.lastChannelList = Date.now()
    }
  }

  private noteActivity(channel: Channel, messages: Message[]): void {
    const entry = this.data.channels?.[channel.id]
    for (const m of messages) {
      if (m.deleted) continue
      const at = Date.parse(m.createdAt)
      if (at > (this.lastMessageAt.get(channel.id) ?? 0)) this.lastMessageAt.set(channel.id, at)
      if (entry && m.author?.id !== this.backend.me.id && (!entry.latestAt || m.createdAt > entry.latestAt)) {
        entry.latestAt = m.createdAt
      }
    }
  }

  // ---- catch-up progress

  private beginCatchUp(sinces: string[]): void {
    const oldest = sinces.reduce<string | undefined>((min, s) => (!min || s < min ? s : min), undefined)
    if (oldest && Date.now() - Date.parse(oldest) > CATCH_UP_THRESHOLD) {
      this.catchingUp = { since: oldest, done: 0, total: sinces.length }
    } else {
      this.catchingUp = null
    }
  }

  private stepCatchUp(): void {
    if (!this.catchingUp) return
    this.catchingUp = { ...this.catchingUp, done: this.catchingUp.done + 1 }
    this.save() // keep progress if the app quits mid catch-up
  }

  private record(conversation: Chat | Channel, messages: Message[]): void {
    const me = this.backend.me.id
    const ref: Mention['conversation'] = {
      kind: conversation.kind,
      id: conversation.id,
      teamId: conversation.kind === 'channel' ? conversation.teamId : undefined,
      name: conversation.name
    }
    for (const message of messages) {
      const id = `${conversation.id}:${message.id}`
      const existing = this.data.mentions.findIndex((m) => m.id === id)
      if (message.deleted) {
        if (existing >= 0) this.data.mentions.splice(existing, 1)
        continue
      }
      if (message.author?.id === me) continue
      const kind = mentionKind(message, me)
      if (!kind) continue
      const mention: Mention = {
        id,
        kind,
        conversation: ref,
        messageId: message.id,
        replyToId: message.replyToId,
        author: message.author,
        createdAt: message.createdAt,
        excerpt: excerpt(message.html),
        seen: existing >= 0 ? this.data.mentions[existing].seen : false
      }
      if (existing >= 0) this.data.mentions[existing] = mention
      else this.data.mentions.push(mention)
    }
  }

  private prune(): void {
    const cutoff = new Date(Date.now() - RETENTION).toISOString()
    this.data.mentions = this.data.mentions.filter((m) => m.createdAt >= cutoff)
  }

  private load(): StoreFile {
    try {
      const stored = JSON.parse(readFileSync(this.file, 'utf8')) as StoreFile
      if (stored.version === 1) return stored
    } catch {
      // First run or unreadable file.
    }
    const start = new Date(Date.now() - FIRST_RUN_LOOKBACK).toISOString()
    return { version: 1, floors: { chats: start, channels: start }, watermarks: {}, mentions: [] }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data))
      renameSync(`${this.file}.tmp`, this.file)
    } catch (err) {
      console.warn('Could not save mentions:', err)
    }
  }
}

function mentionKind(message: Message, me: string): Mention['kind'] | null {
  const targets = message.mentions ?? []
  if (targets.some((t) => t.type === 'user' && t.id === me)) return 'you'
  if (targets.some((t) => t.type === 'channel')) return 'channel'
  if (targets.some((t) => t.type === 'team')) return 'team'
  return null
}

const watermarkKey = (ref: ConversationRef): string => `${ref.kind}:${ref.id}`

const maxIso = (a: string | undefined, b: string): string => (a && a > b ? a : b)

function excerpt(html: string): string {
  const text = html
    .replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 280 ? `${text.slice(0, 279)}…` : text
}
