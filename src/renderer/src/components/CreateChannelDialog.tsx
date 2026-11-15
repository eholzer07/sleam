import { useState, type FormEvent } from 'react'
import { CONSENT_REQUIRED, type Channel, type NewChannel, type Team } from '../../../shared/api'
import { errorText } from '../lib/usePolling'
import { CloseIcon, HashIcon } from './Icons'

interface Props {
  team: Team
  existing: Channel[]
  onCreate: (channel: NewChannel) => Promise<void>
  onClose: () => void
}

const MAX_NAME = 50

/** Teams' channel name rules, checked up front so the user gets a clear message instead of a Graph error. */
function nameProblem(name: string, existing: Channel[]): string | null {
  if (/[~#%&*{}+/\\:<>?|'",]/.test(name)) return 'Names can’t contain ~ # % & * { } + / \\ : < > ? | \' " or commas.'
  if (name.includes('..')) return 'Names can’t contain two periods in a row.'
  if (/^[_.]/.test(name)) return 'Names can’t start with an underscore or period.'
  if (/\.$/.test(name)) return 'Names can’t end with a period.'
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) return 'This team already has a channel with that name.'
  return null
}

export function CreateChannelDialog({ team, existing, onCreate, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConsent, setNeedsConsent] = useState(false)

  const trimmed = name.trim()
  const problem = trimmed ? nameProblem(trimmed, existing) : null

  async function create() {
    if (!trimmed || problem || busy) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({ name: trimmed, description: description.trim() || undefined, private: isPrivate })
    } catch (err) {
      const text = errorText(err)
      if (text.includes(CONSENT_REQUIRED)) setNeedsConsent(true)
      else setError(text)
      setBusy(false)
    }
  }

  async function grantAndCreate() {
    setError(null)
    try {
      await window.sleam.grantChannelCreateAccess()
      setNeedsConsent(false)
      await create()
    } catch (err) {
      setError(errorText(err))
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void create()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal
        aria-labelledby="create-channel-title"
        onSubmit={submit}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <header className="dialog-header">
          <h2 id="create-channel-title">Create a channel</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close (Esc)">
            <CloseIcon />
          </button>
        </header>
        <div className="dialog-body">
          <p className="muted dialog-intro">In {team.name}</p>
          <label className="field-label" htmlFor="channel-name">
            Name
          </label>
          <div className={`field-input ${problem ? 'invalid' : ''}`}>
            <HashIcon />
            <input
              id="channel-name"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. plan-budget"
              autoFocus
            />
            <span className="field-count">{MAX_NAME - name.length}</span>
          </div>
          {problem && <div className="field-problem">{problem}</div>}

          <label className="field-label" htmlFor="channel-description">
            Description <span className="muted">(optional)</span>
          </label>
          <div className="field-input">
            <input
              id="channel-description"
              value={description}
              maxLength={1024}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What’s this channel about?"
            />
          </div>

          <fieldset className="field-choices">
            <legend className="field-label">Visibility</legend>
            <label className="choice">
              <input type="radio" name="visibility" checked={!isPrivate} onChange={() => setIsPrivate(false)} />
              <span>
                <strong>Standard</strong>
                <span className="muted">Everyone in {team.name} can see and join it</span>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="visibility" checked={isPrivate} onChange={() => setIsPrivate(true)} />
              <span>
                <strong>Private</strong>
                <span className="muted">Only people you add. It starts with just you; add people in Teams for now.</span>
              </span>
            </label>
          </fieldset>

          {needsConsent && (
            <div className="consent-inline">
              Creating channels uses Microsoft’s <code>Channel.Create</code> permission, which an IT admin usually has to
              approve.{' '}
              <button type="button" onClick={grantAndCreate}>
                Grant access
              </button>
            </div>
          )}
          {error && <div className="signin-error">{error}</div>}
        </div>
        <footer className="dialog-footer">
          <span />
          <button type="submit" className="btn-primary dialog-go" disabled={!trimmed || !!problem || busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </footer>
      </form>
    </div>
  )
}
