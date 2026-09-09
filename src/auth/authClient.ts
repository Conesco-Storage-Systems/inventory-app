import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '../sync/supabaseClient'

const CACHED_EMAIL_KEY = 'inventoryApp.lastAuthedEmail'

// Tracks "this device has successfully signed in before" separately from
// Supabase's own session object, so a failed background token refresh while
// offline (which returns no session, same as a real sign-out would) doesn't
// bounce the user back to the login screen. Only an explicit signOut() call
// clears it.
export function getCachedAuthedEmail(): string | null {
  try {
    return localStorage.getItem(CACHED_EMAIL_KEY)
  } catch {
    return null
  }
}

export function setCachedAuthedEmail(email: string | null): void {
  try {
    if (email) localStorage.setItem(CACHED_EMAIL_KEY, email)
    else localStorage.removeItem(CACHED_EMAIL_KEY)
  } catch {
    // ignore write failures (e.g. storage disabled)
  }
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export async function setNewPassword(password: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  setCachedAuthedEmail(null)
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// Forces a round-trip to Supabase to check whether the current token is
// actually still good. Only an explicit rejection from the server (bad or
// expired token) counts as "really signed out" — a network failure here
// (offline, unreachable) means we simply couldn't check, not that the
// session is dead, so callers should keep trusting the cache in that case.
export async function isSessionDefinitivelyInvalid(): Promise<boolean> {
  const { error } = await supabase.auth.getUser()
  return error?.name === 'AuthApiError'
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => callback(event, session))
  return () => subscription.unsubscribe()
}
