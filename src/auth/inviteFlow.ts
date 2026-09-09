import { supabase } from '../sync/supabaseClient'

export type InviteLinkType = 'invite' | 'recovery'

// Supabase's invite/reset-password emails redirect back here with the
// session tokens in the URL hash (#access_token=...&type=invite). We parse
// and consume that ourselves (detectSessionInUrl is off) so the app can show
// a "set your password" step before treating them as fully signed in.
export async function consumeInviteOrRecoveryLink(): Promise<InviteLinkType | null> {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return null

  const params = new URLSearchParams(hash.slice(1))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const type = params.get('type')

  if (!accessToken || !refreshToken || (type !== 'invite' && type !== 'recovery')) return null

  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })

  // Strip the tokens from the URL either way so they can't be reused/leaked
  // (e.g. via browser history or a shared screenshot of the address bar).
  window.history.replaceState(null, '', window.location.pathname + window.location.search)

  if (error) return null
  return type
}
