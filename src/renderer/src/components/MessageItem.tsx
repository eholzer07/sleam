import { memo, useMemo } from 'react'
import type { Message } from '../../../shared/api'
import { formatTime } from '../lib/format'
import { sanitizeMessage } from '../lib/html'
import { Avatar } from './Avatar'
import { ThreadIcon } from './Icons'

interface Props {
  message: Message
  compact?: boolean
  onOpenThread?: (message: Message) => void
}

export const MessageItem = memo(function MessageItem({ message, compact, onOpenThread }: Props) {
  const html = useMemo(() => sanitizeMessage(message.html), [message.html])
  const author = message.author?.name ?? 'Unknown'
  const time = formatTime(message.createdAt)

  return (
    <div className={`message ${compact ? 'compact' : ''}`}>
      <div className="message-gutter">
        {compact ? (
          <span className="message-hover-time">{time.replace(/\s?[AP]M$/i, '')}</span>
        ) : (
          <Avatar name={author} seed={message.author?.id} />
        )}
      </div>
      <div className="message-content">
        {!compact && (
          <div className="message-meta">
            <span className="message-author">{author}</span>
            <span className="message-time" title={new Date(message.createdAt).toLocaleString()}>
              {time}
            </span>
          </div>
        )}
        {message.deleted ? (
          <div className="message-body deleted">This message was deleted.</div>
        ) : (
          <div className="message-body">
            <span dangerouslySetInnerHTML={{ __html: html }} />
            {message.edited && <span className="edited"> (edited)</span>}
          </div>
        )}
        {message.reactions.length > 0 && (
          <div className="reactions">
            {message.reactions.map((r) => (
              <span key={r.emoji} className={`reaction ${r.mine ? 'mine' : ''}`}>
                {r.emoji} <span className="reaction-count">{r.count}</span>
              </span>
            ))}
          </div>
        )}
        {onOpenThread && message.replyCount > 0 && (
          <button className="thread-link" onClick={() => onOpenThread(message)}>
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            <span className="thread-link-view">View thread</span>
          </button>
        )}
      </div>
      {onOpenThread && !message.deleted && (
        <div className="message-actions">
          <button title="Reply in thread" onClick={() => onOpenThread(message)}>
            <ThreadIcon />
          </button>
        </div>
      )}
    </div>
  )
})
