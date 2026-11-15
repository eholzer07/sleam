import { useCallback, useEffect, useState } from 'react'
import type { AuthState } from '../../shared/api'
import { SignIn } from './components/SignIn'
import { Workspace } from './components/Workspace'
import { SIGN_IN_REQUIRED_EVENT } from './lib/usePolling'

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null)

  useEffect(() => {
    window.sleam.getAuthState().then(setAuth)
  }, [])

  const signOut = useCallback(async () => setAuth(await window.sleam.signOut()), [])

  // An expired session surfaces from whichever request hits it first.
  useEffect(() => {
    window.addEventListener(SIGN_IN_REQUIRED_EVENT, signOut)
    return () => window.removeEventListener(SIGN_IN_REQUIRED_EVENT, signOut)
  }, [signOut])

  if (!auth) return <div className="splash" />
  if (auth.mode === 'signedOut' || !auth.me) return <SignIn config={auth.config} onSignedIn={setAuth} />
  return <Workspace me={auth.me} demo={auth.mode === 'demo'} onSignOut={signOut} />
}
