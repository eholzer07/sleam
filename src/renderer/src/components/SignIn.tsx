import { useState, type FormEvent } from 'react'
import type { AppConfig, AuthState } from '../../../shared/api'
import { errorText } from '../lib/usePolling'

export function SignIn({
  config,
  tokensSaved,
  onSignedIn
}: {
  config: AppConfig
  tokensSaved: boolean
  onSignedIn: (state: AuthState) => void
}) {
  const [clientId, setClientId] = useState(config.clientId ?? '')
  const [tenantId, setTenantId] = useState(config.tenantId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function attempt(action: () => Promise<AuthState>) {
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await action())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    attempt(() => window.sleam.signIn({ clientId, tenantId }))
  }

  return (
    <div className="signin">
      <div className="signin-drag" />
      <form className="signin-card" onSubmit={submit}>
        <div className="signin-logo">#</div>
        <h1>Sign in to Microsoft Teams</h1>
        <p className="signin-lede">Sleam uses your Teams account. Your messages stay in Microsoft 365.</p>

        <label>
          Application (client) ID
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
            autoFocus
          />
        </label>
        <label>
          <span>
            Directory (tenant) ID <span className="optional">optional</span>
          </span>
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="organizations"
            spellCheck={false}
          />
        </label>

        {error && <div className="signin-error">{error}</div>}

        <button className="btn-primary" disabled={busy || !clientId.trim()}>
          {busy ? 'Finish signing in in your browser…' : 'Sign in with Microsoft'}
        </button>
        <div className="signin-or">or</div>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => attempt(window.sleam.startDemo)}>
          Explore the demo workspace
        </button>

        <p className="signin-help">
          You need an Entra ID app registration with the redirect URI <code>http://localhost</code> under “Mobile and
          desktop applications”. See the README for step-by-step setup.
        </p>
        {!tokensSaved && (
          <p className="signin-help">
            No password store (such as GNOME Keyring or KWallet) is available, so Sleam won’t save your sign-in.
            You’ll sign in again each time Sleam starts.
          </p>
        )}
      </form>
    </div>
  )
}
