import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CONSENT_REQUIRED, type Person } from '../../../shared/api'
import { matchesName, uniqueById } from '../lib/people'
import { errorText } from '../lib/usePolling'
import { Avatar } from './Avatar'
import { CloseIcon } from './Icons'

interface Props {
  /** People from existing chats, suggested before (and alongside) directory results. */
  known: Person[]
  onStart: (people: Person[]) => Promise<void>
  onClose: () => void
}

const MAX_RESULTS = 8

/** Slack's "New message": pick one person for a DM or several for a group DM. */
export function NewMessageDialog({ known, onStart, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Person[]>([])
  const [directory, setDirectory] = useState<Person[]>([])
  const [needsConsent, setNeedsConsent] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [searchNonce, setSearchNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) return setDirectory([])
    let cancelled = false
    const timer = setTimeout(() => {
      window.sleam
        .searchPeople(query)
        .then((people) => {
          if (cancelled) return
          setDirectory(people)
          setNeedsConsent(false)
        })
        .catch((err) => {
          if (cancelled) return
          setDirectory([])
          if (errorText(err).includes(CONSENT_REQUIRED)) setNeedsConsent(true)
          else setError(errorText(err))
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, searchNonce])

  useEffect(() => setHighlight(0), [query])

  const pickedIds = new Set(picked.map((p) => p.id))
  const results = uniqueById(
    known.filter((p) => matchesName(p.name, query, p.email)),
    directory.filter((p) => matchesName(p.name, query, p.email))
  )
    .filter((p) => !pickedIds.has(p.id))
    .slice(0, MAX_RESULTS)

  // Enter picks the highlighted person while typing, and starts the chat otherwise.
  const typing = query.trim() !== ''

  function add(person: Person) {
    setPicked((prev) => uniqueById(prev, [person]))
    setQuery('')
    input.current?.focus()
  }

  async function start() {
    if (picked.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      await onStart(picked)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function allowDirectorySearch() {
    setError(null)
    try {
      await window.sleam.grantPeopleAccess()
      setNeedsConsent(false)
      setSearchNonce((n) => n + 1) // re-run the search with the new permission
    } catch (err) {
      setError(errorText(err))
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length) setHighlight((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (typing && results.length) add(results[Math.min(highlight, results.length - 1)])
      else void start()
    } else if (e.key === 'Backspace' && query === '' && picked.length) {
      setPicked((prev) => prev.slice(0, -1))
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal aria-labelledby="new-message-title">
        <header className="dialog-header">
          <h2 id="new-message-title">New message</h2>
          <button className="icon-button" onClick={onClose} title="Close (Esc)">
            <CloseIcon />
          </button>
        </header>
        <div className="people-field" onClick={() => input.current?.focus()}>
          <span className="people-field-label">To:</span>
          {picked.map((p) => (
            <span key={p.id} className="people-chip">
              <Avatar name={p.name} seed={p.id} size={18} />
              {p.name}
              <button onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}>
                <CloseIcon />
              </button>
            </span>
          ))}
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={picked.length ? '' : 'Type a name or email'}
            autoFocus
          />
        </div>
        <div className="people-results" role="listbox">
          {results.map((p, i) => (
            <button
              key={p.id}
              role="option"
              aria-selected={typing && i === highlight}
              className={`mention-option ${typing && i === highlight ? 'active' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => add(p)}
            >
              <Avatar name={p.name} seed={p.id} size={24} />
              <span className="mention-option-name">{p.name}</span>
              {p.email && <span className="mention-option-detail">{p.email}</span>}
            </button>
          ))}
          {query.trim() && results.length === 0 && !needsConsent && <div className="people-empty">No matches</div>}
          {needsConsent && (
            <div className="mention-popup-note">
              Only people you've chatted with are shown.{' '}
              <button onClick={allowDirectorySearch}>Search everyone in your organization</button>
            </div>
          )}
        </div>
        {error && <div className="signin-error dialog-error">{error}</div>}
        <footer className="dialog-footer">
          <span className="muted">{picked.length > 1 ? 'Starts a group chat' : ''}</span>
          <button className="btn-primary dialog-go" onClick={start} disabled={picked.length === 0 || busy}>
            {busy ? 'Opening…' : picked.length > 1 ? 'Start group chat' : 'Start chat'}
          </button>
        </footer>
      </div>
    </div>
  )
}
