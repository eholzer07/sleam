import { Fragment, useLayoutEffect, useRef } from 'react'
import type { Message } from '../../../shared/api'
import { dayKey, formatDay } from '../lib/format'
import { MessageItem } from './MessageItem'

const GROUP_WINDOW_MS = 5 * 60_000

interface Props {
  messages: Message[] | null
  error: string | null
  onOpenThread?: (message: Message) => void
}

export function MessageList({ messages, error, onOpenThread }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  // Follow new messages only if the reader is already at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scroller.current
    if (el) pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <div className="message-list" ref={scroller} onScroll={onScroll}>
      {error && <div className="list-error">{error}</div>}
      {!messages && !error && <div className="list-status">Loading messages…</div>}
      {messages?.length === 0 && <div className="list-status">No messages yet. Say hello 👋</div>}
      {messages?.map((message, i) => {
        const prev = messages[i - 1]
        const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt)
        const compact =
          !newDay &&
          !prev.deleted &&
          prev.replyCount === 0 &&
          prev.author?.id === message.author?.id &&
          Date.parse(message.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS
        return (
          <Fragment key={message.id}>
            {newDay && (
              <div className="day-divider">
                <span>{formatDay(message.createdAt)}</span>
              </div>
            )}
            <MessageItem message={message} compact={compact} onOpenThread={onOpenThread} />
          </Fragment>
        )
      })}
    </div>
  )
}
