import { useEffect, useState } from 'react'
import type { ConversationRef, SearchResult } from '../../../shared/api'
import { formatDay, formatTime } from '../lib/format'
import { errorText } from '../lib/usePolling'
import { Avatar } from './Avatar'
import { HashIcon, SearchIcon } from './Icons'

interface Props {
  query: string
  /** Display name for a conversation, plus its team for channels. */
  describe: (ref: ConversationRef) => { name: string; context?: string }
  onOpen: (result: SearchResult) => void
}

export function SearchView({ query, describe, onOpen }: Props) {
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [nextOffset, setNextOffset] = useState<number | undefined>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResults(null)
    setError(null)
    window.sleam
      .searchMessages(query)
      .then((page) => {
        if (cancelled) return
        setResults(page.results)
        setNextOffset(page.nextOffset)
      })
      .catch((err) => !cancelled && setError(errorText(err)))
    return () => {
      cancelled = true
    }
  }, [query])

  async function loadMore() {
    if (nextOffset === undefined || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await window.sleam.searchMessages(query, nextOffset)
      setResults((prev) => [...(prev ?? []), ...page.results.filter((r) => !prev?.some((p) => p.id === r.id))])
      setNextOffset(page.nextOffset)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="conversation">
      <header className="conversation-header">
        <div className="conversation-title">
          <SearchIcon />
          <h1>Results for “{query}”</h1>
        </div>
        <div className="conversation-topic">
          {results === null && !error
            ? 'Searching…'
            : results && `${results.length}${nextOffset !== undefined ? '+' : ''} message${results.length === 1 ? '' : 's'}`}
        </div>
      </header>
      <div className="mentions-list">
        {error && <div className="mentions-problem">{error}</div>}
        {results?.length === 0 && (
          <div className="empty">
            No messages match “{query}”. Brand-new messages can take a minute to show up in search.
          </div>
        )}
        {results?.map((r) => {
          const where = describe(r.conversation)
          return (
            <button key={`${r.conversation.id}:${r.id}`} className="mention-item" onClick={() => onOpen(r)}>
              <div className="mention-where">
                {r.conversation.kind === 'channel' && <HashIcon />}
                <span>{where.name}</span>
                {where.context && <span className="mention-chip">{where.context}</span>}
                {r.replyToId && <span className="mention-chip">in a thread</span>}
                {r.createdAt && (
                  <span className="mention-when">
                    {formatDay(r.createdAt)} · {formatTime(r.createdAt)}
                  </span>
                )}
              </div>
              <div className="mention-body">
                <Avatar name={r.author?.name ?? '?'} seed={r.author?.id} size={32} />
                <div>
                  <div className="message-author">{r.author?.name ?? 'Unknown'}</div>
                  <div className="mention-excerpt search-snippet">
                    {r.snippet.map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
        {nextOffset !== undefined && (
          <button className="unread-note unread-more search-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Show more results'}
          </button>
        )}
      </div>
    </div>
  )
}
