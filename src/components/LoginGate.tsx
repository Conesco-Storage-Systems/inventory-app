import { useEffect, useState, type ReactNode } from 'react'
import {
  getCachedAuthedEmail,
  getCurrentSession,
  onAuthStateChange,
  setCachedAuthedEmail,
  signIn,
  signOut,
} from '../auth/authClient'
import { setEditorName } from '../state/editor'
import { startAutoSync } from '../sync/syncEngine'
import { supabaseConfigured } from '../sync/supabaseClient'

export default function LoginGate({ children }: { children: ReactNode }) {
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')
  // Start from whatever this device last successfully authenticated as, so a
  // reload while offline shows the app immediately instead of waiting on a
  // network call that may never come back.
  const [userEmail, setUserEmail] = useState<string | null>(() => getCachedAuthedEmail())

  useEffect(() => {
    if (!supabaseConfigured) {
      setCheckingSession(false)
      return
    }

    getCurrentSession()
      .then((session) => {
        if (session?.user.email) {
          setUserEmail(session.user.email)
          setCachedAuthedEmail(session.user.email)
        }
        // No live session but we already trust a cached one from before —
        // leave it alone. This is far more likely a network hiccup (or a
        // background token refresh that couldn't reach Supabase) than an
        // actual sign-out, and offline use shouldn't get bounced for that.
      })
      .catch(() => {
        // Same reasoning — a failed check is not a sign-out.
      })
      .finally(() => setCheckingSession(false))

    return onAuthStateChange((session) => {
      if (session?.user.email) {
        setUserEmail(session.user.email)
        setCachedAuthedEmail(session.user.email)
      }
    })
  }, [])

  useEffect(() => {
    if (!userEmail) return
    setEditorName(userEmail)
    startAutoSync()
  }, [userEmail])

  async function handleSignOut() {
    await signOut()
    setUserEmail(null)
  }

  if (!supabaseConfigured) {
    return (
      <div className="editor-gate-overlay">
        <div className="editor-gate-panel">
          <h2>Setup needed</h2>
          <p>
            This app isn't connected to the shared database yet — add{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to a{' '}
            <code>.env.local</code> file and restart the dev server.
          </p>
        </div>
      </div>
    )
  }

  if (userEmail) {
    return (
      <>
        <button type="button" className="sign-out-button" onClick={handleSignOut}>
          Sign out ({userEmail})
        </button>
        {children}
      </>
    )
  }

  if (checkingSession) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSigningIn(true)
    setError('')
    const message = await signIn(email, password)
    if (message) setError(message)
    setSigningIn(false)
  }

  return (
    <div className="editor-gate-overlay">
      <form className="editor-gate-panel" onSubmit={handleSubmit}>
        <h2>Sign in</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="field-error">{error}</p>}
        <button type="submit" disabled={signingIn || !email.trim() || !password}>
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
