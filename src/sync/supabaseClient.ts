import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  console.warn(
    'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing). ' +
      'The app will run in local-only mode: nothing will sync to the shared database.',
  )
}

// detectSessionInUrl is off because we parse invite/recovery links ourselves
// (see src/auth/inviteFlow.ts) so we can show a "set your password" screen
// before dropping someone straight into the app.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder',
  { auth: { detectSessionInUrl: false } },
)
