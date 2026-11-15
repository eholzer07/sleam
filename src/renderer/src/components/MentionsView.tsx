import { useEffect, useRef } from 'react'
import type { Mention, MentionsState } from '../../../shared/api'
import { formatDay, formatTime } from '../lib/format'
import { Avatar } from './Avatar'
import { AtIcon, HashIcon } from './Icons'

interface Props {
  state: MentionsState | null
  error: string | null
  onOpen: (mention: Mention) => void
  onSeen: () => void
}

export function MentionsView({ state, error, onOpen, onSeen }: Props) {
  // Mentions that were new when this view opened stay highlighted for the visit, then count as seen (like Slack).
  const highlighted = useRef(new Set<string>())
  const fresh = state?.mentions.filter((m) => !m.seen) ?? []
  for (const m of fresh) highlighted.current.add(m.id) // idempotent, so safe during render
  useEffect(() => {
    if (fresh.length === 0) return
    void window.sleam.markMentionsSeen(fresh.map((m) => m.id)).then(onSeen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const catchingUp = state?.catchingUp
  const problem = error ?? state?.error

  return (
    <div className="conversation">
      <header className="conversation-header">
        <div className="conversation-title">
          <AtIcon />
          <h1>Mentions</h1>
        </div>
        <div className="conversation-topic">
          {catchingUp
            ? `Catching up since ${formatDay(catchingUp.since)}… (${catchingUp.done} of ${catchingUp.total})`
            : state?.lastScanAt
              ? `Checked at ${formatTime(state.lastScanAt)}`
              : 'Checking for mentions…'}
        </div>
      </header>
      <div className="mentions-list">
        {problem && <div className="mentions-problem">{problem}</div>}
        {state && state.mentions.length === 0 && !catchingUp && (
          <div className="empty">No mentions yet. When someone @-mentions you, it shows up here.</div>
        )}
        {state?.mentions.map((m) => (
          <button
            key={m.id}
            className={`mention-item ${highlighted.current.has(m.id) ? 'new' : ''}`}
            onClick={() => onOpen(m)}
          >
            <div className="mention-where">
              {m.conversation.kind === 'channel' && <HashIcon />}
              <span>{m.conversation.name}</span>
              {m.replyToId && <span className="mention-chip">in a thread</span>}
              {m.kind !== 'you' && <span className="mention-chip">@{m.kind}</span>}
              <span className="mention-when">
                {formatDay(m.createdAt)} · {formatTime(m.createdAt)}
              </span>
            </div>
            <div className="mention-body">
              <Avatar name={m.author?.name ?? '?'} seed={m.author?.id} size={32} />
              <div>
                <div className="message-author">{m.author?.name ?? 'Unknown'}</div>
                <div className="mention-excerpt">{m.excerpt}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
