import type { Session } from '@supabase/supabase-js'
import { supabase } from '../sync/supabaseClient'

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
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
