import { useEffect, useState, type ReactNode } from 'react'
import {
  getCachedAuthedEmail,
  getCurrentSession,
  isSessionDefinitivelyInvalid,
  onAuthStateChange,
  setCachedAuthedEmail,
  setNewPassword,
  signIn,
  signOut,
} from '../auth/authClient'
import { consumeInviteOrRecoveryLink, type InviteLinkType } from '../auth/inviteFlow'
import { setEditorName } from '../state/editor'
import { startAutoSync } from '../sync/syncEngine'
import { supabaseConfigured } from '../sync/supabaseClient'

export default function LoginGate({ children }: { children: ReactNode }) {
  const [checkingSession, setCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')
  const [linkType, setLinkType] = useState<InviteLinkType | null>(null)
  const [newPassword, setNewPasswordDraft] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [setPasswordError, setSetPasswordError] = useState('')
  // Start from whatever this device last successfully authenticated as, so a
  // reload while offline shows the app immediately instead of waiting on a
  // network call that may never come back.
  const [userEmail, setUserEmail] = useState<string | null>(() => getCachedAuthedEmail())

  useEffect(() => {
    if (!supabaseConfigured) {
      setCheckingSession(false)
      return
    }

    consumeInviteOrRecoveryLink()
      .then(async (type) => {
        if (type) {
          setLinkType(type)
          return
        }

        const session = await getCurrentSession()
        if (session?.user.email) {
          setUserEmail(session.user.email)
          setCachedAuthedEmail(session.user.email)
          return
        }
        // No live session locally. If we have a cached login, only clear it
        // if Supabase explicitly rejects the token — otherwise this is far
        // more likely a network hiccup than an actual sign-out, and offline
        // use shouldn't get bounced for that.
        if (getCachedAuthedEmail() && (await isSessionDefinitivelyInvalid())) {
          await signOut()
          setUserEmail(null)
        }
      })
      .catch(() => {
        // Same reasoning — a failed check is not a sign-out.
      })
      .finally(() => setCheckingSession(false))

    return onAuthStateChange((event, session) => {
      if (session?.user.email) {
        setUserEmail(session.user.email)
        setCachedAuthedEmail(session.user.email)
        return
      }
      // supabase-js only fires SIGNED_OUT when it has definitively determined
      // the session is gone (an explicit signOut() call, or a background
      // token refresh that the server actually rejected) — never just because
      // a request couldn't reach the network. Safe to trust as "really out."
      if (event === 'SIGNED_OUT') {
        setCachedAuthedEmail(null)
        setUserEmail(null)
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

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault()
    setSetPasswordError('')
    if (newPassword !== newPasswordConfirm) {
      setSetPasswordError('Passwords do not match.')
      return
    }
    setSettingPassword(true)
    const message = await setNewPassword(newPassword)
    setSettingPassword(false)
    if (message) {
      setSetPasswordError(message)
      return
    }
    const session = await getCurrentSession()
    if (session?.user.email) {
      setUserEmail(session.user.email)
      setCachedAuthedEmail(session.user.email)
    }
    setLinkType(null)
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

  if (linkType) {
    return (
      <div className="editor-gate-overlay">
        <form className="editor-gate-panel" onSubmit={handleSetNewPassword}>
          <h2>{linkType === 'invite' ? 'Welcome — set your password' : 'Set a new password'}</h2>
          <p>
            {linkType === 'invite'
              ? 'Choose a password to finish setting up your account.'
              : 'Choose a new password for your account.'}
          </p>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPasswordDraft(e.target.value)}
              autoFocus
              required
              minLength={6}
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {setPasswordError && <p className="field-error">{setPasswordError}</p>}
          <button type="submit" disabled={settingPassword || !newPassword || !newPasswordConfirm}>
            {settingPassword ? 'Saving…' : 'Save password'}
          </button>
        </form>
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
