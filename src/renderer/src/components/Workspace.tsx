import { useEffect, useMemo, useState } from 'react'
import type { Channel, Chat, Conversation, ConversationRef, Mention, Message, NewChannel, Person, SearchResult } from '../../../shared/api'
import { SearchView } from './SearchView'
import { CreateChannelDialog } from './CreateChannelDialog'
import { uniqueById } from '../lib/people'
import { errorText, usePolling } from '../lib/usePolling'
import { ConversationView } from './ConversationView'
import { MentionsView } from './MentionsView'
import { NewMessageDialog } from './NewMessageDialog'
import { ThemeDialog } from './ThemeDialog'
import { loadDefaultTeam, saveDefaultTeam, withDefaultFirst } from '../lib/defaultTeam'
import { UnreadsView, type UnreadItem } from './UnreadsView'
import { Sidebar } from './Sidebar'
import { TeamRail } from './TeamRail'
import { ThreadPane } from './ThreadPane'
import { TopBar } from './TopBar'

const LAST_READ_KEY = 'sleam:lastRead'

function loadLastRead(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const latest = (a: string | undefined, b: string | undefined): string => ((a ?? '') > (b ?? '') ? a! : (b ?? ''))

function saveLastRead(map: Record<string, string>): void {
  try {
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(map))
  } catch {
    // Unread markers are a convenience; losing them is fine.
  }
}

export function Workspace({ me, demo, onSignOut }: { me: Person; demo: boolean; onSignOut: () => void }) {
  const teams = usePolling(() => window.sleam.listTeams(), 5 * 60_000, [])
  // Only the newest batch of chats is polled; older batches load once, when the user asks for them.
  const recentChats = usePolling(() => window.sleam.listChats(), 15_000, [])
  const [olderChats, setOlderChats] = useState<Chat[]>([])
  const [olderCursor, setOlderCursor] = useState<string | undefined | null>(null) // null: use the newest batch's cursor
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderError, setOlderError] = useState<string | null>(null)
  const nextOlderCursor = olderCursor === null ? recentChats.data?.olderCursor : olderCursor
  const chats = useMemo(() => {
    if (!recentChats.data) return null
    const byId = new Map(olderChats.map((c) => [c.id, c]))
    for (const c of recentChats.data.chats) byId.set(c.id, c) // fresher data wins
    return [...byId.values()].sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
  }, [recentChats.data, olderChats])

  async function loadOlderChats() {
    if (!nextOlderCursor || loadingOlder) return
    setLoadingOlder(true)
    setOlderError(null)
    try {
      const page = await window.sleam.listChats(nextOlderCursor)
      setOlderChats((prev) => [...prev, ...page.chats])
      setOlderCursor(page.olderCursor)
    } catch (err) {
      setOlderError(errorText(err))
    } finally {
      setLoadingOlder(false)
    }
  }
  const [teamId, setTeamId] = useState<string | null>(null)
  const channels = usePolling(
    () => (teamId ? window.sleam.listChannels(teamId) : Promise.resolve([])),
    5 * 60_000,
    [teamId]
  )
  const mentions = usePolling(() => window.sleam.getMentions(), 5_000, [])
  const channelActivity = usePolling(() => window.sleam.getChannelActivity(), 10_000, [])
  const [view, setView] = useState<'conversation' | 'mentions' | 'unreads' | 'search'>('conversation')
  const [searchQuery, setSearchQuery] = useState('')
  const [active, setActive] = useState<Conversation | null>(null)
  const [thread, setThread] = useState<Message | null>(null)
  const [filter, setFilter] = useState('')
  const [lastRead, setLastRead] = useState(loadLastRead)
  // Read points set by this window, applied immediately while the backend catches up.
  const [readNow, setReadNow] = useState<Record<string, string>>({})
  const [readError, setReadError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [creatingChannel, setCreatingChannel] = useState(false)

  // People from your chats, most recent first: suggested when starting a DM or @-mentioning.
  const knownPeople = useMemo(
    () => uniqueById(...(chats ?? []).map((c) => c.members)).filter((p) => p.id !== me.id),
    [chats, me.id]
  )

  const [themeOpen, setThemeOpen] = useState(false)

  // ⌘N starts a new message, like Slack. ⌘, opens the theme settings, the usual Mac shortcut for preferences.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setComposing(true)
      }
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault()
        setThemeOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function createChannel(details: NewChannel) {
    if (!teamId) return
    const channel = await window.sleam.createChannel(teamId, details)
    // Show it right away; the next channel poll is up to five minutes off.
    channels.setData((prev) =>
      [...(prev ?? []).filter((c) => c.id !== channel.id), channel].sort((a, b) => a.name.localeCompare(b.name))
    )
    setCreatingChannel(false)
    select(channel)
  }

  /** Opens the DM or group DM with exactly these people, creating it if there isn't one yet. */
  async function startChat(people: Person[]) {
    const ids = new Set([me.id, ...people.map((p) => p.id)])
    const existing = chats?.find(
      (c) => c.chatType !== 'meeting' && c.members.length === ids.size && c.members.every((m) => ids.has(m.id))
    )
    const chat = existing ?? (await window.sleam.createChat(people))
    // A brand-new chat may not be in the polled batch yet; keep it in the list until it is.
    if (!existing) setOlderChats((prev) => [chat, ...prev.filter((c) => c.id !== chat.id)])
    setComposing(false)
    select(chat)
  }

  const team = teams.data?.find((t) => t.id === teamId) ?? null

  // Your default team opens at launch and sits at the top of the rail.
  const [defaultTeamId, setDefaultTeamId] = useState<string | null>(loadDefaultTeam)
  const orderedTeams = useMemo(() => withDefaultFirst(teams.data ?? [], defaultTeamId), [teams.data, defaultTeamId])

  function toggleDefaultTeam(id: string) {
    const next = defaultTeamId === id ? null : id
    setDefaultTeamId(next)
    saveDefaultTeam(next)
  }

  useEffect(() => {
    if (!teamId && orderedTeams.length) setTeamId(orderedTeams[0].id)
  }, [orderedTeams, teamId])

  useEffect(() => {
    void window.sleam.setCurrentTeam(teamId)
  }, [teamId])

  // Land on the team's General channel (or the first one) when nothing is open.
  useEffect(() => {
    if (active || !channels.data?.length) return
    setActive(channels.data.find((c) => c.name.toLowerCase() === 'general') ?? channels.data[0])
  }, [channels.data, active])

  // Fallback for chats whose read state Teams didn't report: new chats start out read,
  // and the open chat stays read as messages arrive.
  useEffect(() => {
    if (!chats) return
    setLastRead((prev) => {
      const next = { ...prev }
      for (const chat of chats) {
        if (!(chat.id in next) || chat.id === active?.id) next[chat.id] = chat.lastActivity ?? new Date(0).toISOString()
      }
      saveLastRead(next)
      return next
    })
  }, [chats, active?.id])

  // Everything unread, including whatever is open right now.
  const unreadChats = useMemo(
    () =>
      (chats ?? []).filter((c) => {
        const readAt = latest(c.lastReadAt ?? lastRead[c.id], readNow[c.id])
        return c.lastActivity && c.lastActivity > readAt
      }),
    [chats, lastRead, readNow]
  )
  const unreadChannels = useMemo(
    () => (channelActivity.data ?? []).filter((a) => a.latestAt && a.latestAt > latest(a.lastReadAt, readNow[a.channel.id])),
    [channelActivity.data, readNow]
  )

  const viewing = view === 'conversation' ? active : null

  // Reading the open conversation: tell the backend (synced to Teams for chats) whenever it has something new.
  useEffect(() => {
    if (!viewing) return
    const isUnread = unreadChats.some((c) => c.id === viewing.id) || unreadChannels.some((a) => a.channel.id === viewing.id)
    if (isUnread) void markRead([viewing])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id, unreadChats, unreadChannels])

  const unread = useMemo(
    () => new Set([...unreadChats.map((c) => c.id), ...unreadChannels.map((a) => a.channel.id)].filter((id) => id !== viewing?.id)),
    [unreadChats, unreadChannels, viewing?.id]
  )
  const unreadTeams = useMemo(
    () => new Set(unreadChannels.filter((a) => a.channel.id !== viewing?.id).map((a) => a.channel.teamId)),
    [unreadChannels, viewing?.id]
  )
  const unreadItems = useMemo<UnreadItem[]>(
    () =>
      [
        ...unreadChats.map((c) => ({
          conversation: c,
          since: latest(c.lastReadAt ?? lastRead[c.id], readNow[c.id]),
          latestAt: c.lastActivity,
          context: c.chatType === 'meeting' ? 'Meeting' : undefined
        })),
        ...unreadChannels.map((a) => ({
          conversation: a.channel,
          since: latest(a.lastReadAt, readNow[a.channel.id]),
          latestAt: a.latestAt,
          context: a.teamName
        }))
      ].sort((a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? '')),
    [unreadChats, unreadChannels, lastRead, readNow]
  )

  async function markRead(conversations: Conversation[]) {
    const now = new Date().toISOString()
    setReadNow((prev) => ({ ...prev, ...Object.fromEntries(conversations.map((c) => [c.id, now])) }))
    try {
      await Promise.all(conversations.map((c) => window.sleam.markRead({ kind: c.kind, id: c.id, teamId: c.kind === 'channel' ? c.teamId : undefined })))
      setReadError(null)
    } catch (err) {
      setReadError(`Couldn't mark as read in Teams: ${errorText(err)}`)
    }
    recentChats.refresh()
    channelActivity.refresh()
    mentions.refresh()
  }

  const unseenMentions = mentions.data?.mentions.filter((m) => !m.seen) ?? []
  const mentionCounts = new Map<string, number>()
  const teamMentions = new Map<string, number>()
  // Like Slack, badge a conversation only while the mentioning message is still unread there.
  const readPoints = new Map<string, string>()
  for (const c of chats ?? []) readPoints.set(c.id, latest(c.lastReadAt ?? lastRead[c.id], readNow[c.id]))
  for (const a of channelActivity.data ?? []) readPoints.set(a.channel.id, latest(a.lastReadAt, readNow[a.channel.id]))
  for (const m of unseenMentions) {
    if (m.conversation.id === viewing?.id) continue
    if (m.createdAt <= (readPoints.get(m.conversation.id) ?? '')) continue
    mentionCounts.set(m.conversation.id, (mentionCounts.get(m.conversation.id) ?? 0) + 1)
    const teamOf = m.conversation.teamId
    if (teamOf) teamMentions.set(teamOf, (teamMentions.get(teamOf) ?? 0) + 1)
  }

  // Opening a conversation counts as seeing its mentions.
  useEffect(() => {
    if (!viewing) return
    const seen = unseenMentions.filter((m) => m.conversation.id === viewing.id).map((m) => m.id)
    if (seen.length) void window.sleam.markMentionsSeen(seen).then(mentions.refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentions.data, viewing?.id])

  function select(conversation: Conversation) {
    // Conversations opened from Mentions/Unreads may live in another team.
    if (conversation.kind === 'channel' && conversation.teamId !== teamId) setTeamId(conversation.teamId)
    setActive(conversation)
    setView('conversation')
    setThread(null)
    setFilter('')
  }

  function showView(next: 'mentions' | 'unreads') {
    setView(next)
    setThread(null)
  }

  /** Name (and team, for channels) of any conversation the app knows about. */
  function describe(ref: ConversationRef): { name: string; context?: string } {
    if (ref.kind === 'channel') {
      const known = channelActivity.data?.find((a) => a.channel.id === ref.id)
      if (known) return { name: known.channel.name, context: known.teamName }
      const listed = channels.data?.find((c) => c.id === ref.id)
      return { name: listed?.name ?? 'Channel', context: teams.data?.find((t) => t.id === ref.teamId)?.name }
    }
    const chat = chats?.find((c) => c.id === ref.id)
    return { name: chat?.name ?? 'Chat', context: chat?.chatType === 'meeting' ? 'Meeting' : undefined }
  }

  /** Opens a message's conversation, and its thread when it's a channel reply (from Mentions or Search). */
  async function openMessage(ref: ConversationRef, name: string, replyToId?: string) {
    let conversation: Conversation
    if (ref.kind === 'channel') {
      const known =
        (ref.teamId === teamId ? channels.data?.find((c) => c.id === ref.id) : undefined) ??
        channelActivity.data?.find((a) => a.channel.id === ref.id)?.channel
      conversation = known ?? ({ kind: 'channel', id: ref.id, teamId: ref.teamId!, name } satisfies Channel)
    } else {
      conversation = chats?.find((c) => c.id === ref.id) ?? { kind: 'chat', id: ref.id, name, chatType: 'group', members: [] }
    }
    select(conversation)
    if (replyToId && conversation.kind === 'channel') {
      try {
        const root = (await window.sleam.listMessages(conversation)).find((m) => m.id === replyToId)
        if (root) setThread(root)
      } catch {
        // The channel still opened; the thread just isn't pinned open.
      }
    }
  }

  const openMention = (mention: Mention) => openMessage(mention.conversation, mention.conversation.name, mention.replyToId)
  const openSearchResult = (result: SearchResult) =>
    openMessage(result.conversation, describe(result.conversation).name, result.replyToId)

  function search(query: string) {
    setSearchQuery(query)
    setView('search')
    setThread(null)
  }

  function selectTeam(id: string) {
    if (id === teamId) return
    setTeamId(id)
    setActive(null)
    setThread(null)
  }

  return (
    <div className="app">
      <TopBar query={filter} onQuery={setFilter} onSearch={search} placeholder="Search messages, channels and people" />
      <div className="app-body">
        <TeamRail
          teams={orderedTeams}
          defaultTeamId={defaultTeamId}
          onToggleDefault={toggleDefaultTeam}
          activeTeamId={teamId}
          onSelect={selectTeam}
          unreadTeams={unreadTeams}
          teamMentions={teamMentions}
          me={me}
          demo={demo}
          onSignOut={onSignOut}
          onOpenTheme={() => setThemeOpen(true)}
        />
        <Sidebar
          team={team}
          isDefaultTeam={!!team && team.id === defaultTeamId}
          onToggleDefaultTeam={() => team && toggleDefaultTeam(team.id)}
          channels={teamId ? channels.data : []}
          chats={chats}
          hasOlderChats={!!nextOlderCursor}
          loadingOlderChats={loadingOlder}
          onLoadOlderChats={loadOlderChats}
          active={viewing}
          unread={unread}
          mentionCounts={mentionCounts}
          filter={view === 'search' ? '' : filter}
          error={teams.error ?? recentChats.error ?? olderError ?? readError ?? channels.error}
          onSelect={select}
          view={view}
          unseenMentions={unseenMentions.length}
          unreadCount={unreadItems.length}
          onShowView={showView}
          onNewMessage={() => setComposing(true)}
          onCreateChannel={() => setCreatingChannel(true)}
        />
        <main className="main">
          {view === 'search' ? (
            <SearchView key={searchQuery} query={searchQuery} describe={describe} onOpen={openSearchResult} />
          ) : view === 'mentions' ? (
            <MentionsView state={mentions.data} error={mentions.error} onOpen={openMention} onSeen={mentions.refresh} />
          ) : view === 'unreads' ? (
            <UnreadsView items={unreadItems} me={me} onOpen={select} onMarkRead={markRead} />
          ) : active ? (
            <ConversationView
              key={active.id}
              conversation={active}
              me={me}
              knownPeople={knownPeople}
              teamName={active.kind === 'channel' && active.teamId === team?.id ? team.name : undefined}
              onOpenThread={setThread}
            />
          ) : (
            <div className="empty">Pick a channel or conversation to get started.</div>
          )}
        </main>
        {thread && view === 'conversation' && active?.kind === 'channel' && (
          <ThreadPane
            key={thread.id}
            conversation={active}
            root={thread}
            me={me}
            knownPeople={knownPeople}
            teamName={active.teamId === team?.id ? team.name : undefined}
            onClose={() => setThread(null)}
          />
        )}
      </div>
      {creatingChannel && team && (
        <CreateChannelDialog
          team={team}
          existing={channels.data ?? []}
          onCreate={createChannel}
          onClose={() => setCreatingChannel(false)}
        />
      )}
      {themeOpen && <ThemeDialog onClose={() => setThemeOpen(false)} />}
      {composing && <NewMessageDialog known={knownPeople} onStart={startChat} onClose={() => setComposing(false)} />}
    </div>
  )
}
