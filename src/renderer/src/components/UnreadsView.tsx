import { useEffect, useState } from 'react'
import type { Conversation, Message, Person } from '../../../shared/api'
import { dayKey, formatDay } from '../lib/format'
import { errorText } from '../lib/usePolling'
import { Avatar } from './Avatar'
import { CheckIcon, HashIcon, InboxIcon } from './Icons'
import { MessageItem } from './MessageItem'

export interface UnreadItem {
  conversation: Conversation
  /** Messages after this point are unread. */
  since: string
  /** Newest activity; the preview refetches only when this moves. */
  latestAt?: string
  /** Team name, for channels. */
  context?: string
}

interface Props {
  items: UnreadItem[]
  me: Person
  onOpen: (conversation: Conversation) => void
  onMarkRead: (conversations: Conversation[]) => void
}

const PREVIEW = 10

export function UnreadsView({ items, me, onOpen, onMarkRead }: Props) {
  return (
    <div className="conversation">
      <header className="conversation-header">
        <div className="conversation-title">
          <InboxIcon />
          <h1>Unreads</h1>
        </div>
        <div className="conversation-topic">
          {items.length === 0 ? 'All caught up' : `${items.length} conversation${items.length === 1 ? '' : 's'}`}
        </div>
        {items.length > 1 && (
          <button className="unread-mark unread-mark-all" onClick={() => onMarkRead(items.map((i) => i.conversation))}>
            Mark all as read
          </button>
        )}
      </header>
      <div className="mentions-list">
        {items.length === 0 && <div className="empty">You're all caught up. 🎉</div>}
        {items.map((item) => (
          <UnreadGroup
            key={item.conversation.id}
            item={item}
            me={me}
            onOpen={() => onOpen(item.conversation)}
            onMarkRead={() => onMarkRead([item.conversation])}
          />
        ))}
      </div>
    </div>
  )
}

function UnreadGroup({ item, me, onOpen, onMarkRead }: { item: UnreadItem; me: Person; onOpen: () => void; onMarkRead: () => void }) {
  const { conversation, since } = item
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.sleam
      .listMessagesSince(conversation, since)
      .then((found) => {
        if (cancelled) return
        setMessages(
          found
            .filter((m) => !m.deleted && m.author?.id !== me.id && m.createdAt > since)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        )
        setError(null)
      })
      .catch((err) => !cancelled && setError(errorText(err)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, since, item.latestAt, me.id])

  const shown = messages?.slice(-PREVIEW) ?? []
  const hidden = (messages?.length ?? 0) - shown.length

  return (
    <section className="unread-group">
      <div className="unread-group-header">
        <button className="unread-group-title" onClick={onOpen} title="Open conversation">
          {conversation.kind === 'channel' ? (
            <HashIcon />
          ) : (
            <Avatar name={conversation.name} seed={conversation.members.find((m) => m.id !== me.id)?.id} size={18} />
          )}
          <span>{conversation.name}</span>
          {item.context && <span className="mention-chip">{item.context}</span>}
        </button>
        <button className="unread-mark" onClick={onMarkRead}>
          <CheckIcon /> Mark as read
        </button>
      </div>
      {error && <div className="mentions-problem">{error}</div>}
      {!messages && !error && <div className="sidebar-loading unread-loading">Loading…</div>}
      {messages?.length === 0 && <div className="unread-note">New activity since {formatDay(since)} (nothing to preview)</div>}
      {hidden > 0 && (
        <button className="unread-note unread-more" onClick={onOpen}>
          {hidden} earlier unread message{hidden === 1 ? '' : 's'}. Open the conversation to see all.
        </button>
      )}
      {shown.map((m, i) => (
        <div key={m.id} className="unread-message">
          {(i === 0 || dayKey(shown[i - 1].createdAt) !== dayKey(m.createdAt)) && (
            <div className="day-divider unread-day">
              <span>{formatDay(m.createdAt)}</span>
            </div>
          )}
          {m.replyToId && <div className="unread-reply-label">Reply in thread</div>}
          <MessageItem message={m} />
        </div>
      ))}
    </section>
  )
}
