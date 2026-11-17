import { useState, type ReactNode } from 'react'
import type { Channel, Chat, Conversation, Team } from '../../../shared/api'
import { Avatar } from './Avatar'
import { AtIcon, ChevronIcon, ComposeIcon, EyeOffIcon, HashIcon, InboxIcon, PlusIcon, VideoIcon, StarIcon } from './Icons'

interface Props {
  team: Team | null
  isDefaultTeam: boolean
  onToggleDefaultTeam: () => void
  channels: Channel[] | null
  chats: Chat[] | null
  hasOlderChats: boolean
  loadingOlderChats: boolean
  onLoadOlderChats: () => void
  active: Conversation | null
  unread: Set<string>
  /** Unseen @-mentions per conversation id, shown as a red count badge like Slack. */
  mentionCounts: Map<string, number>
  filter: string
  error: string | null
  onSelect: (conversation: Conversation) => void
  view: 'conversation' | 'mentions' | 'unreads' | 'search'
  unseenMentions: number
  unreadCount: number
  onShowView: (view: 'mentions' | 'unreads') => void
  onNewMessage: () => void
  onCreateChannel: () => void
}

const MEETINGS_HIDDEN_KEY = 'sleam.sidebar.meetingsHidden'

/** Teams creates a chat for every meeting; these aren't DMs and clutter the sidebar. */
const isMeetingChat = (chat: Chat): boolean => chat.chatType === 'meeting'

export function Sidebar(props: Props) {
  const { team, channels, chats, unread, mentionCounts, filter, error, onSelect } = props
  const mentionBadge = (id: string) => {
    const count = mentionCounts.get(id)
    return count ? <span className="sidebar-badge" title={`${count} unread mention${count === 1 ? '' : 's'}`}>{count}</span> : null
  }
  const { active } = props
  const matches = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase())
  const [meetingsHidden, setMeetingsHidden] = useStoredBoolean(MEETINGS_HIDDEN_KEY, false)

  const visibleChats = chats?.filter((c) => matches(c.name)) ?? null
  const directChats = visibleChats?.filter((c) => !isMeetingChat(c)) ?? null
  const meetingChats = visibleChats?.filter(isMeetingChat) ?? null
  const meetingUnread = meetingChats?.filter((c) => unread.has(c.id)).length ?? 0

  const chatItem = (chat: Chat) => (
    <button
      key={chat.id}
      className={`sidebar-item ${active?.id === chat.id ? 'active' : ''} ${unread.has(chat.id) ? 'unread' : ''}`}
      onClick={() => onSelect(chat)}
      title={chat.name}
    >
      <span className="sidebar-icon">
        {chat.chatType === 'oneOnOne' ? (
          <Avatar name={chat.name} seed={chat.members.find((m) => m.name === chat.name)?.id} size={20} />
        ) : isMeetingChat(chat) ? (
          <VideoIcon />
        ) : (
          <span className="group-count">{chat.members.length}</span>
        )}
      </span>
      <span className="sidebar-label">{chat.name}</span>
      {mentionBadge(chat.id)}
    </button>
  )

  const loadOlder = props.hasOlderChats && (
    <button className="sidebar-more" onClick={props.onLoadOlderChats} disabled={props.loadingOlderChats}>
      {props.loadingOlderChats ? 'Loading…' : 'Load older chats'}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>{team?.name ?? 'Microsoft Teams'}</h2>
        {team && (
          <button
            className={`sidebar-default ${props.isDefaultTeam ? 'on' : ''}`}
            onClick={props.onToggleDefaultTeam}
            aria-pressed={props.isDefaultTeam}
            title={props.isDefaultTeam ? 'Your default team. Click to remove.' : 'Make this your default team: it opens when Sleam starts'}
            aria-label="Default team"
          >
            <StarIcon filled={props.isDefaultTeam} />
          </button>
        )}
        <button className="sidebar-compose" onClick={props.onNewMessage} title="New message (⌘N)" aria-label="New message">
          <ComposeIcon />
        </button>
      </div>
      <div className="sidebar-scroll">
        {error && <div className="sidebar-error">{error}</div>}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${props.view === 'unreads' ? 'active' : ''} ${props.unreadCount ? 'unread' : ''}`}
            onClick={() => props.onShowView('unreads')}
          >
            <span className="sidebar-icon">
              <InboxIcon />
            </span>
            <span className="sidebar-label">Unreads</span>
            {props.unreadCount > 0 && <span className="sidebar-count">{props.unreadCount}</span>}
          </button>
          <button
            className={`sidebar-item ${props.view === 'mentions' ? 'active' : ''} ${props.unseenMentions ? 'unread' : ''}`}
            onClick={() => props.onShowView('mentions')}
          >
            <span className="sidebar-icon">
              <AtIcon />
            </span>
            <span className="sidebar-label">Mentions</span>
            {props.unseenMentions > 0 && <span className="sidebar-badge">{props.unseenMentions}</span>}
          </button>
        </nav>
        <Section
          id="channels"
          title="Channels"
          loading={team !== null && channels === null}
          onAdd={team ? props.onCreateChannel : undefined}
          addLabel="Create a channel"
        >
          {channels?.filter((c) => matches(c.name)).map((channel) => (
            <button
              key={channel.id}
              className={`sidebar-item ${active?.id === channel.id ? 'active' : ''} ${unread.has(channel.id) ? 'unread' : ''}`}
              onClick={() => onSelect(channel)}
              title={channel.description}
            >
              <span className="sidebar-icon">
                <HashIcon />
              </span>
              <span className="sidebar-label">{channel.name}</span>
              {mentionBadge(channel.id)}
            </button>
          ))}
        </Section>
        <Section id="dms" title="Direct messages" loading={chats === null} onAdd={props.onNewMessage} addLabel="New message">
          {directChats?.map(chatItem)}
          {loadOlder}
        </Section>
        {!meetingsHidden && (meetingChats === null || meetingChats.length > 0) && (
          <Section
            id="meetings"
            title="Meeting chats"
            loading={chats === null}
            defaultOpen={false}
            badge={meetingUnread}
            pinned={meetingChats?.find((c) => c.id === active?.id)}
            renderItem={chatItem}
            onHide={() => setMeetingsHidden(true)}
          >
            {meetingChats?.map(chatItem)}
            {loadOlder}
          </Section>
        )}
        {meetingsHidden && chats !== null && chats.some(isMeetingChat) && (
          <button className="sidebar-restore" onClick={() => setMeetingsHidden(false)}>
            Show meeting chats{meetingUnread > 0 ? ` (${meetingUnread} unread)` : ''}
          </button>
        )}
      </div>
    </aside>
  )
}

interface SectionProps<T> {
  id: string
  title: string
  loading: boolean
  children: ReactNode
  defaultOpen?: boolean
  /** Unread count shown on the header while the section is collapsed (grey; red is reserved for mentions). */
  badge?: number
  /** An item (e.g. the open conversation) that stays visible while collapsed, like Slack. */
  pinned?: T
  renderItem?: (item: T) => ReactNode
  onHide?: () => void
  onAdd?: () => void
  addLabel?: string
}

function Section<T>({ id, title, loading, children, defaultOpen = true, badge = 0, pinned, renderItem, onHide, onAdd, addLabel }: SectionProps<T>) {
  const [open, setOpen] = useStoredBoolean(`sleam.sidebar.open.${id}`, defaultOpen)
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-header">
        <button className="sidebar-section-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronIcon open={open} />
          {title}
          {!open && badge > 0 && <span className="sidebar-count">{badge}</span>}
        </button>
        {onAdd && (
          <button className="sidebar-section-action" onClick={onAdd} title={addLabel} aria-label={addLabel}>
            <PlusIcon />
          </button>
        )}
        {onHide && (
          <button className="sidebar-section-action" onClick={onHide} title={`Hide ${title.toLowerCase()}`} aria-label={`Hide ${title.toLowerCase()}`}>
            <EyeOffIcon />
          </button>
        )}
      </div>
      {open ? (loading ? <div className="sidebar-loading">Loading…</div> : children) : pinned && renderItem?.(pinned)}
    </section>
  )
}

/** A boolean UI preference that survives restarts. */
function useStoredBoolean(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored === null ? fallback : stored === 'true'
    } catch {
      return fallback
    }
  })
  const set = (next: boolean) => {
    setValue(next)
    try {
      localStorage.setItem(key, String(next))
    } catch {
      // Preference just won't persist.
    }
  }
  return [value, set]
}
