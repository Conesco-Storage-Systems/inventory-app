import { useEffect, useState, type ReactNode } from 'react'
import { getCurrentSession, onAuthStateChange, signIn, signOut } from '../auth/authClient'
import { setEditorName } from '../state/editor'
import { startAutoSync } from '../sync/syncEngine'
import { supabaseConfigured } from '../sync/supabaseClient'

export default function LoginGate({ children }: { children: ReactNode }) {
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigured) {
      setCheckingSession(false)
      return
    }
    getCurrentSession().then((session) => {
      setUserEmail(session?.user.email ?? null)
      setCheckingSession(false)
    })
    return onAuthStateChange((session) => {
      setUserEmail(session?.user.email ?? null)
    })
  }, [])

  useEffect(() => {
    if (!userEmail) return
    setEditorName(userEmail)
    startAutoSync()
  }, [userEmail])

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

  if (checkingSession) return null

  if (userEmail) {
    return (
      <>
        <button type="button" className="sign-out-button" onClick={() => signOut()}>
          Sign out ({userEmail})
        </button>
        {children}
      </>
    )
  }

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
