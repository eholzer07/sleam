import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CONSENT_REQUIRED, type MentionCandidate, type OutgoingMention } from '../../../shared/api'
import { markupWithMentions } from '../lib/html'
import { matchesName, uniqueById } from '../lib/people'
import { errorText } from '../lib/usePolling'
import { Avatar } from './Avatar'
import { AtIcon, BoldIcon, CodeIcon, HashIcon, ItalicIcon, LinkIcon, ListIcon, SendIcon, StrikeIcon } from './Icons'

interface Props {
  placeholder: string
  onSend: (html: string, mentions: OutgoingMention[]) => Promise<void>
  /** Suggested after "@": people in the conversation, plus everyone-in-the-channel/team targets. */
  mentionables?: MentionCandidate[]
  /** Also suggest matches from the organization's directory (channels; a chat can only mention its members). */
  searchDirectory?: boolean
}

const MAX_SUGGESTIONS = 8

/** The "@query" being typed just before the caret, if any. */
function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|[\s(])@([^@\s][^@\n]{0,40}|)$/.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1]
  if (query.split(' ').length > 3) return null
  return { start: caret - query.length - 1, query }
}

export function Composer({ placeholder, onSend, mentionables = [], searchDirectory = false }: Props) {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  // @-mention autocomplete.
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [directory, setDirectory] = useState<{ people: MentionCandidate[]; needsConsent: boolean }>({ people: [], needsConsent: false })
  const typed = mentionQueryAt(text, caret)
  const mention = typed && typed.start !== dismissedAt ? typed : null
  const query = mention?.query ?? ''

  useEffect(() => {
    if (!mention || !searchDirectory || query.trim().length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      window.sleam
        .searchPeople(query)
        .then((people) => {
          if (!cancelled) setDirectory({ people: people.map((p) => ({ type: 'user', id: p.id, name: p.name, detail: p.email })), needsConsent: false })
        })
        .catch((err) => {
          if (!cancelled) setDirectory({ people: [], needsConsent: errorText(err).includes(CONSENT_REQUIRED) })
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchDirectory, mention !== null])

  const suggestions = mention
    ? uniqueById(
        mentionables.filter((c) => c.type === 'user' && matchesName(c.name, query, c.detail)),
        directory.people.filter((c) => matchesName(c.name, query, c.detail)),
        // "@channel"/"@team" also match by keyword, like Slack's @channel and @here.
        mentionables.filter((c) => c.type !== 'user' && (matchesName(c.name, query) || matchesName(c.type, query) || matchesName('everyone', query)))
      ).slice(0, MAX_SUGGESTIONS)
    : []
  const showSuggestions = suggestions.length > 0 || (mention !== null && directory.needsConsent && query.length >= 2)

  useEffect(() => setHighlight(0), [query])

  function pick(candidate: MentionCandidate) {
    if (!mention) return
    const inserted = `@${candidate.name} `
    const next = text.slice(0, mention.start) + inserted + text.slice(caret)
    const position = mention.start + inserted.length
    setText(next)
    setPicked((prev) => uniqueById(prev, [candidate]))
    setDismissedAt(mention.start)
    setCaret(position)
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(position, position)
    })
  }

  async function allowDirectorySearch() {
    try {
      await window.sleam.grantPeopleAccess()
      setDirectory({ people: [], needsConsent: false })
    } catch (err) {
      setError(errorText(err))
    }
  }

  // Grow with the content up to the CSS max-height.
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const { html, mentions } = markupWithMentions(text, picked)
      await onSend(html, mentions)
      setText('')
      setPicked([])
      setDismissedAt(null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }

  /** Wraps the selection in a Slack-style marker, e.g. *bold*. */
  function wrap(before: string, after = before) {
    const el = input.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const next = text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, end + before.length)
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showSuggestions && suggestions.length > 0 && !e.nativeEvent.isComposing) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setHighlight((i) => (i + step + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(suggestions[Math.min(highlight, suggestions.length - 1)])
        return
      }
    }
    if (showSuggestions && e.key === 'Escape') {
      e.preventDefault()
      setDismissedAt(mention!.start)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    } else if (e.metaKey && e.key === 'b') {
      e.preventDefault()
      wrap('*')
    } else if (e.metaKey && e.key === 'i') {
      e.preventDefault()
      wrap('_')
    }
  }

  return (
    <div className="composer-wrap">
      {showSuggestions && (
        <div className="mention-popup" role="listbox" aria-label="People to mention">
          {suggestions.map((c, i) => (
            <button
              key={`${c.type}:${c.id}`}
              role="option"
              aria-selected={i === highlight}
              className={`mention-option ${i === highlight ? 'active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(c)}
            >
              {c.type === 'user' ? (
                <Avatar name={c.name} seed={c.id} size={20} />
              ) : (
                <span className="mention-option-icon">{c.type === 'channel' ? <HashIcon /> : <AtIcon />}</span>
              )}
              <span className="mention-option-name">{c.type === 'user' ? c.name : `@${c.type}`}</span>
              <span className="mention-option-detail">
                {c.type === 'user' ? c.detail : `Notify everyone in ${c.type === 'channel' ? '#' : ''}${c.name}`}
              </span>
            </button>
          ))}
          {directory.needsConsent && searchDirectory && (
            <div className="mention-popup-note">
              Showing people you've chatted with.{' '}
              <button onMouseDown={(e) => e.preventDefault()} onClick={allowDirectorySearch}>
                Search everyone
              </button>
            </div>
          )}
        </div>
      )}
      <div className="composer">
        <div className="composer-toolbar">
          <ToolButton title="Bold (⌘B)" onClick={() => wrap('*')}>
            <BoldIcon />
          </ToolButton>
          <ToolButton title="Italic (⌘I)" onClick={() => wrap('_')}>
            <ItalicIcon />
          </ToolButton>
          <ToolButton title="Strikethrough" onClick={() => wrap('~')}>
            <StrikeIcon />
          </ToolButton>
          <span className="toolbar-divider" />
          <ToolButton title="Link" onClick={() => wrap('', ' https://')}>
            <LinkIcon />
          </ToolButton>
          <ToolButton title="Bulleted list" onClick={() => wrap('\n• ', '')}>
            <ListIcon />
          </ToolButton>
          <span className="toolbar-divider" />
          <ToolButton title="Code" onClick={() => wrap('`')}>
            <CodeIcon />
          </ToolButton>
        </div>
        <textarea
          ref={input}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onBlur={() => mention && setDismissedAt(mention.start)}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <div className="composer-footer">
          <button className="send-button" disabled={!text.trim() || sending} onClick={send} title="Send (Enter)">
            <SendIcon />
          </button>
        </div>
      </div>
      <div className="composer-hint">
        {error ? <span className="composer-error">{error}</span> : <><strong>Shift + Enter</strong> to add a new line</>}
      </div>
    </div>
  )
}

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="tool-button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  )
}
