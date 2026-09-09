import type { Session } from '@supabase/supabase-js'
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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  setCachedAuthedEmail(null)
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => subscription.unsubscribe()
}
