// Every account here is First.Last@conesco.com — this is purely a display
// transform, never touching the stored email itself (that's still what's
// used to sign in, and what every recordedBy/heldBy/etc. field stores).
// Anything that isn't recognizably "first.last@domain" (a stray typo, a
// shared/no-reply address, etc.) is shown as-is rather than mangled.
export function formatDisplayName(email: string): string {
  if (!email) return ''
  const local = email.split('@')[0]
  if (!local) return email

  const parts = local.split('.').filter(Boolean)
  if (parts.length === 0) return email

  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ')
}
