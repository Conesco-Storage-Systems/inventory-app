import { useEffect, useState } from 'react'
import { SYNC_ERROR_EVENT, getRecentSyncErrors } from '../sync/syncEngine'

export default function SyncErrorBanner() {
  const [messages, setMessages] = useState<string[]>(() => getRecentSyncErrors())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    function handleSyncError(event: Event) {
      setMessages((event as CustomEvent<string[]>).detail)
      setDismissed(false)
    }
    window.addEventListener(SYNC_ERROR_EVENT, handleSyncError)
    return () => window.removeEventListener(SYNC_ERROR_EVENT, handleSyncError)
  }, [])

  if (dismissed || messages.length === 0) return null

  return (
    <div className="sync-error-banner">
      <div className="sync-error-messages">
        <strong>Sync problem{messages.length > 1 ? `s (${messages.length})` : ''}:</strong>
        <ul>
          {messages.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      </div>
      <button type="button" className="sync-error-dismiss" onClick={() => setDismissed(true)}>
        ✕
      </button>
    </div>
  )
}
